import { BROWSER_COMMANDS, NATIVE_CAPABILITIES, NATIVE_PROTOCOL_VERSION } from '../shared/browser-native'
import type { NativeCommand, NativeExtensionMessage, NativeHello } from '../shared/browser-native'
import type { BrowserCommandResult, BrowserEventName } from '../shared/browser-types'

export interface NativePortLike {
  postMessage(message: NativeExtensionMessage): void
  disconnect(): void
  onMessage: { addListener(listener: (message: unknown) => void): void }
  onDisconnect: { addListener(listener: () => void): void }
}
export interface NativeActionContext {
  assertActive(): void
  remainingMs(): number
}
export interface NativeConnectionStatus {
  connected: boolean
  status: 'connecting' | 'connected' | 'host_missing' | 'app_offline' | 'error'
  error?: string
}

function isCommand(value: unknown): value is NativeCommand {
  if (!value || typeof value !== 'object') return false
  const c = value as Partial<NativeCommand>
  return c.type === 'cmd' && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 200
    && typeof c.ownerId === 'string' && c.ownerId.length > 0 && c.ownerId.length <= 200
    && typeof c.epoch === 'string' && c.epoch.length > 0 && c.epoch.length <= 200
    && typeof c.deadline === 'number' && Number.isFinite(c.deadline)
    && BROWSER_COMMANDS.includes(c.name as NativeCommand['name'])
    && (c.params === undefined || (!!c.params && typeof c.params === 'object' && !Array.isArray(c.params)))
}

export class NativeExtensionTransport {
  private port: NativePortLike | null = null
  private epoch: string | null = null
  private serial: Promise<void> = Promise.resolve()
  private queued = 0
  private seen = new Set<string>()
  private cancelled = new Set<string>()
  private activeExecution: { key: string; reject: (error: Error) => void } | null = null
  private status: NativeConnectionStatus = { connected: false, status: 'connecting' }
  private lastPong = 0

  constructor(private readonly deps: {
    hello: Omit<NativeHello, 'type' | 'protocolVersion' | 'capabilities'>
    execute: (command: NativeCommand, context: NativeActionContext) => Promise<BrowserCommandResult>
    now?: () => number
    onStatus?: (status: NativeConnectionStatus) => void
    onDisconnect?: () => void
    disconnectError?: () => string | undefined
  }) {}

  connectionStatus(): NativeConnectionStatus { return { ...this.status } }
  private now(): number { return this.deps.now?.() ?? Date.now() }
  private update(status: NativeConnectionStatus): void { this.status = status; this.deps.onStatus?.(this.connectionStatus()) }

  attach(port: NativePortLike): void {
    this.close()
    this.port = port
    this.epoch = null
    this.seen.clear()
    this.cancelled.clear()
    this.lastPong = this.now()
    this.update({ connected: false, status: 'connecting' })
    port.onMessage.addListener(message => this.receive(port, message))
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return
      const error = this.deps.disconnectError?.()
      this.port = null
      this.epoch = null
      this.activeExecution?.reject(new Error('RESULT_UNKNOWN: browser connection epoch changed during execution'))
      if (this.status.status !== 'app_offline' && this.status.status !== 'error') {
        this.update({ connected: false, status: /not found|not registered|host.*missing/i.test(error ?? '') ? 'host_missing' : 'app_offline', error })
      }
      this.deps.onDisconnect?.()
    })
    try {
      port.postMessage({ ...this.deps.hello, type: 'hello', protocolVersion: NATIVE_PROTOCOL_VERSION, capabilities: [...NATIVE_CAPABILITIES] })
    } catch (error) {
      this.fail(String(error))
    }
  }

  close(): void {
    const previous = this.port
    this.port = null
    this.epoch = null
    this.activeExecution?.reject(new Error('RESULT_UNKNOWN: browser connection epoch changed during execution'))
    if (previous) { try { previous.disconnect() } catch { /* Chrome already closed it */ } }
  }

  fail(error: string): void {
    this.close()
    this.update({ connected: false, status: /not found|not registered|host.*missing/i.test(error) ? 'host_missing' : 'error', error })
    this.deps.onDisconnect?.()
  }

  heartbeat(): void {
    if (!this.port) return
    if (this.now() - this.lastPong > 60_000) { this.fail('APP_OFFLINE: BS Coding did not answer the heartbeat'); return }
    try { this.port.postMessage({ type: 'ping' }) } catch (error) { this.fail(String(error)) }
  }

  event(ownerId: string, name: BrowserEventName, data: unknown): void {
    if (!this.port || !this.epoch || !this.status.connected) return
    try { this.port.postMessage({ type: 'event', epoch: this.epoch, ownerId, name, data }) } catch (error) { this.fail(String(error)) }
  }

  private receive(port: NativePortLike, message: unknown): void {
    if (this.port !== port || !message || typeof message !== 'object') return
    const m = message as Record<string, unknown>
    if (m.type === 'pong') { this.lastPong = this.now(); return }
    if (m.type === 'host_status') {
      this.update({ connected: false, status: String(m.code).toLowerCase().includes('offline') ? 'app_offline' : 'error', error: String(m.error ?? 'Native host unavailable') })
      this.close()
      this.deps.onDisconnect?.()
      return
    }
    if (m.type === 'hello_result') {
      if (m.ok !== true || m.protocolVersion !== NATIVE_PROTOCOL_VERSION || typeof m.epoch !== 'string' || !m.epoch || m.epoch.length > 200) {
        this.fail(String(m.error ?? 'VERSION_MISMATCH: update BS Coding and its browser extension'))
        return
      }
      this.epoch = m.epoch
      this.lastPong = this.now()
      this.update({ connected: true, status: 'connected' })
      return
    }
    if (m.type === 'cancel') {
      const key = `${m.epoch}/${m.id}`
      if (m.epoch === this.epoch && typeof m.id === 'string' && this.seen.has(key)) {
        this.cancelled.add(key)
        // An active Chrome/CDP call may never return. Quarantine its epoch
        // before releasing the serial queue; the mutation result is unknown.
        if (this.activeExecution?.key === key) this.fail('RESULT_UNKNOWN: active browser command cancelled; reconnecting after debugger teardown')
      }
      return
    }
    if (!this.epoch || !this.status.connected || !isCommand(message)) return
    const command = message
    const epoch = this.epoch
    const key = `${epoch}/${command.id}`
    if (this.seen.has(key)) return // A mutation request is never replayed.
    const reply = (result: BrowserCommandResult): void => {
      if (this.port !== port || this.epoch !== epoch) return
      try {
        let response: NativeExtensionMessage = { ...result, type: 'result', id: command.id, epoch, ownerId: command.ownerId }
        if (new TextEncoder().encode(JSON.stringify(response)).byteLength > 8 * 1024 * 1024) {
          response = { type: 'result', id: command.id, epoch, ownerId: command.ownerId, ok: false, error: 'MESSAGE_TOO_LARGE: browser artifact exceeds the 8 MiB native message limit' }
        }
        port.postMessage(response)
      } catch (error) { this.fail(String(error)) }
    }
    if (command.deadline - this.now() > 120_000) { reply({ ok: false, error: 'DEADLINE_INVALID: browser commands must expire within 120 seconds' }); return }
    if (this.seen.size >= 8192 || this.queued >= 128) { reply({ ok: false, error: 'QUEUE_FULL: browser command queue is full; reconnect to continue' }); return }
    this.seen.add(key)
    this.queued++
    const assertActive = (): void => {
      if (this.port !== port || this.epoch !== epoch || command.epoch !== epoch) throw new Error('RESULT_UNKNOWN: browser connection epoch changed')
      if (this.cancelled.has(key)) throw new Error('COMMAND_CANCELLED: browser command cancelled before action')
      if (this.now() >= command.deadline) throw new Error('COMMAND_EXPIRED: browser command deadline passed')
    }
    const run = this.serial.then(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let execution: typeof this.activeExecution = null
      try {
        assertActive()
        const quarantine = new Promise<never>((_resolve, reject) => {
          execution = { key, reject }
          this.activeExecution = execution
          timer = setTimeout(() => {
            if (this.port === port && this.epoch === epoch && this.activeExecution === execution) {
              this.fail('RESULT_UNKNOWN: browser command deadline passed during execution; reconnecting after debugger teardown')
            }
          }, Math.max(0, command.deadline - this.now()))
        })
        const result = await Promise.race([
          this.deps.execute(command, { assertActive, remainingMs: () => Math.max(0, command.deadline - this.now()) }),
          quarantine
        ])
        assertActive()
        reply(result)
      } catch (error) { reply({ ok: false, error: String(error) }) }
      finally {
        if (timer !== undefined) clearTimeout(timer)
        if (this.activeExecution === execution) this.activeExecution = null
        this.queued--
      }
    })
    this.serial = run.catch(() => {})
  }
}
