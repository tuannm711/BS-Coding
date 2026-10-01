import net, { type Socket } from 'node:net'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { NativeFrameDecoder, encodeNativeFrame } from './native-framing'
import { BROWSER_COMMANDS, NATIVE_CAPABILITIES, NATIVE_PROTOCOL_VERSION, type NativeHello } from '../../shared/browser-native'
import type { BrowserCommandName, BrowserCommandResult, BrowserStatusInfo, BrowserTabInfo, SnapshotNode } from '../../shared/browser-types'
import { snapshotToText, countSnapshotNodes } from './snapshot-format'

interface Deps {
  endpoint: string
  token: string
  extensionId: string
  screenshotDir?: string
  snapshotDir?: string
  nativeHostInstalled?: boolean
  stateFile?: string
}
interface Client { socket: Socket; id: string; epoch: string; hello: NativeHello }
interface Pending { client: Client; ownerId: string; finish(result: BrowserCommandResult): void }
export interface BrowserExecutionScope { ownerId: string; signal?: AbortSignal }

export class BrowserService {
  private server: net.Server | undefined
  private readonly sockets = new Set<Socket>()
  private readonly clients = new Map<string, Client>()
  private readonly profiles = new Map<string, { label: string; extensionVersion: string }>()
  private readonly disabled = new Set<string>()
  private selectedId: string | undefined
  private readonly ownerClients = new Map<string, string>()
  private readonly pending = new Map<string, Pending>()
  private readonly listeners = new Set<(status: BrowserStatusInfo) => void>()
  private readonly logs = new Map<string, { console: unknown[]; network: unknown[] }>()
  private error: string | undefined
  private installed: boolean
  constructor(private readonly deps: Deps) {
    this.installed = deps.nativeHostInstalled ?? false
    if (deps.stateFile && existsSync(deps.stateFile)) {
      try {
        const state = JSON.parse(readFileSync(deps.stateFile, 'utf8')) as { selectedId?: unknown; owners?: unknown; profiles?: Record<string, { label: string; extensionVersion: string }>; disabled?: unknown[] }
        if (typeof state.selectedId === 'string' && /^[\w-]{1,100}$/.test(state.selectedId)) this.selectedId = state.selectedId
        if (state.owners && typeof state.owners === 'object') for (const [owner, client] of Object.entries(state.owners)) {
          if (owner.length > 0 && owner.length <= 200 && typeof client === 'string' && /^[\w-]{1,100}$/.test(client)) this.ownerClients.set(owner, client)
        }
        if (state.profiles && typeof state.profiles === 'object') for (const [id, info] of Object.entries(state.profiles)) {
          if (/^[\w-]{1,100}$/.test(id) && typeof info?.label === 'string' && info.label.length <= 80 && typeof info?.extensionVersion === 'string' && info.extensionVersion.length <= 40) this.profiles.set(id, info)
        }
        if (Array.isArray(state.disabled)) for (const id of state.disabled) if (typeof id === 'string' && this.profiles.has(id)) this.disabled.add(id)
      } catch { this.error = 'Browser connection state could not be read. Select a profile and assign a tab again.' }
    }
  }
  private persist(): void {
    if (!this.deps.stateFile) return
    mkdirSync(path.dirname(this.deps.stateFile), { recursive: true })
    const temporary = `${this.deps.stateFile}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify({ selectedId: this.selectedId, owners: Object.fromEntries(this.ownerClients), profiles: Object.fromEntries(this.profiles), disabled: [...this.disabled] }), { mode: 0o600 })
    renameSync(temporary, this.deps.stateFile)
  }

  getStatus(): BrowserStatusInfo {
    const selected = this.selectedId ? this.clients.get(this.selectedId) : undefined
    return { status: this.error ? 'error' : selected ? 'paired' : this.server ? 'listening' : 'idle', paired: Boolean(selected), port: 0, transport: 'native', nativeHostInstalled: this.installed, error: this.error, selectedConnectionId: this.selectedId,
      connections: [...this.profiles].map(([id, info]) => ({ id, ...info, connected: this.clients.has(id), enabled: !this.disabled.has(id) })) }
  }
  setSetup(installed: boolean, error?: string): void { this.installed = installed; this.error = error; this.changed() }
  async configure(config: Pick<Deps, 'endpoint' | 'token' | 'extensionId'>): Promise<void> {
    if (this.deps.endpoint === config.endpoint && this.deps.token === config.token) return
    await this.close()
    Object.assign(this.deps, config)
  }
  selectConnection(id: string): void {
    if (!this.clients.has(id)) throw new Error('Browser profile is not connected')
    this.selectedId = id; this.persist(); this.error = undefined; this.changed()
  }
  setConnectionEnabled(id: string, enabled: boolean): void {
    if (!this.profiles.has(id)) throw new Error('Browser profile is not known')
    if (enabled) this.disabled.delete(id)
    else { this.disabled.add(id); this.clients.get(id)?.socket.destroy() }
    this.persist()
    this.changed()
  }
  onStatusChange(callback: (status: BrowserStatusInfo) => void): () => void { this.listeners.add(callback); return () => this.listeners.delete(callback) }
  private changed(): void { const status = this.getStatus(); for (const listener of this.listeners) listener(status) }

  async start(): Promise<number> {
    if (this.server) return 0
    if (!this.deps.endpoint || !this.deps.token) throw new Error('Native browser setup is unavailable; use Install / Repair helper')
    const server = net.createServer(socket => this.accept(socket))
    const listen = () => new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.deps.endpoint, () => { server.removeListener('error', reject); resolve() })
    })
    try { await listen() }
    catch (error) {
      if (process.platform === 'win32' || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || !existsSync(this.deps.endpoint)) throw error
      const socketInfo = lstatSync(this.deps.endpoint)
      if (!socketInfo.isSocket() || socketInfo.uid !== process.getuid?.()) throw error
      const stale = await new Promise<boolean>(resolve => {
        const probe = net.createConnection(this.deps.endpoint)
        const finish = (value: boolean) => { probe.destroy(); resolve(value) }
        probe.setTimeout(500, () => finish(false))
        probe.once('connect', () => finish(false))
        probe.once('error', e => finish((e as NodeJS.ErrnoException).code === 'ECONNREFUSED'))
      })
      if (!stale) throw error
      unlinkSync(this.deps.endpoint)
      await listen()
    }
    this.server = server
    server.on('error', error => { this.error = `Browser IPC unavailable: ${error.message}`; this.changed() })
    if (process.platform !== 'win32') chmodSync(this.deps.endpoint, 0o600)
    this.changed(); return 0
  }
  pair(): never { throw new Error('Native browser connection does not use pairing codes. Install the helper and connect the extension.') }
  async waitForPaired(timeoutMs: number): Promise<boolean> {
    if (this.getStatus().paired) return true
    return new Promise(resolve => {
      const timer = setTimeout(() => { off(); resolve(false) }, timeoutMs)
      const off = this.onStatusChange(status => { if (status.paired) { clearTimeout(timer); off(); resolve(true) } })
    })
  }
  execute(name: BrowserCommandName, params?: Record<string, unknown>, timeoutMs = 30_000, scope: BrowserExecutionScope = { ownerId: 'ui' }): Promise<BrowserCommandResult> {
    return this.command(name, params, timeoutMs, scope)
  }
  async listTabs(connectionId: string): Promise<BrowserTabInfo[]> {
    const result = await this.command('listTabs', {}, 10_000, { ownerId: 'ui' }, connectionId)
    if (!result.ok) throw new Error(result.error)
    return Array.isArray(result.data) ? result.data as BrowserTabInfo[] : []
  }
  async assignTab(ownerId: string, connectionId: string, tabId: number): Promise<void> {
    if (!ownerId || !Number.isSafeInteger(tabId)) throw new Error('Invalid session/tab assignment')
    const result = await this.command('claimTab', { tabId }, 10_000, { ownerId }, connectionId)
    if (!result.ok) throw new Error(result.error)
    this.ownerClients.set(ownerId, connectionId)
    this.persist()
  }
  private command(name: BrowserCommandName | 'claimTab', params: Record<string, unknown> | undefined, timeoutMs: number, scope: BrowserExecutionScope, explicitClient?: string): Promise<BrowserCommandResult> {
    const id = explicitClient ?? this.ownerClients.get(scope.ownerId) ?? this.selectedId
    const client = id ? this.clients.get(id) : undefined
    if (!client) return Promise.resolve({ ok: false, error: 'Browser profile is not connected. Open Browser settings and connect the extension.' })
    if (scope.signal?.aborted) return Promise.resolve({ ok: false, error: 'Browser command cancelled before send' })
    if (!scope.ownerId || scope.ownerId.length > 200 || !BROWSER_COMMANDS.includes(name)) return Promise.resolve({ ok: false, error: 'Invalid browser command scope' })
    if (this.pending.size >= 100) return Promise.resolve({ ok: false, error: 'Browser queue is full' })
    const requestId = randomUUID()
    const duration = Math.min(Math.max(timeoutMs, 1), 120_000)
    let wire: Buffer
    try { wire = encodeNativeFrame({ type: 'cmd', id: requestId, epoch: client.epoch, ownerId: scope.ownerId, name, params, deadline: Date.now() + duration }, 512 * 1024) }
    catch { return Promise.resolve({ ok: false, error: 'Browser command is too large' }) }
    if (name !== 'listTabs' && name !== 'claimTab' && this.ownerClients.get(scope.ownerId) !== client.id) { this.ownerClients.set(scope.ownerId, client.id); this.persist() }
    return new Promise(resolve => {
      const cancel = () => { if (!client.socket.destroyed) client.socket.write(encodeNativeFrame({ type: 'cancel', id: requestId, epoch: client.epoch })) }
      const abort = () => { cancel(); finish({ ok: false, error: 'RESULT_UNKNOWN: browser command cancelled after send; it will not be replayed' }) }
      const timer = setTimeout(() => { cancel(); finish({ ok: false, error: `RESULT_UNKNOWN: browser command timed out (${name}); do not repeat a mutation without checking the page` }) }, duration)
      const finish = (result: BrowserCommandResult) => {
        if (!this.pending.has(requestId)) return
        this.pending.delete(requestId); clearTimeout(timer); scope.signal?.removeEventListener('abort', abort); resolve(result)
      }
      this.pending.set(requestId, { client, ownerId: scope.ownerId, finish })
      scope.signal?.addEventListener('abort', abort, { once: true })
      client.socket.write(wire, error => { if (error) finish({ ok: false, error: 'RESULT_UNKNOWN: browser connection closed during send' }) })
    })
  }
  getConsoleLogs(limit = 200, ownerId?: string): unknown[] { return this.getLogs('console', limit, ownerId) }
  getNetworkLogs(limit = 200, ownerId?: string): unknown[] { return this.getLogs('network', limit, ownerId) }
  private getLogs(kind: 'console' | 'network', limit: number, ownerId?: string): unknown[] {
    const id = ownerId ? this.ownerClients.get(ownerId) : this.selectedId
    if (!id) return []
    const key = ownerId ? `${id}:${ownerId}` : `${id}:ui`
    return (this.logs.get(key)?.[kind] ?? []).slice(-Math.min(Math.max(limit, 0), 200))
  }
  async close(): Promise<void> {
    for (const pending of this.pending.values()) pending.finish({ ok: false, error: 'RESULT_UNKNOWN: browser service closed' })
    for (const socket of this.sockets) socket.destroy()
    this.clients.clear(); this.selectedId = undefined
    const server = this.server; this.server = undefined
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    if (server && process.platform !== 'win32' && existsSync(this.deps.endpoint)) unlinkSync(this.deps.endpoint)
    this.changed()
  }
  private accept(socket: Socket): void {
    if (this.sockets.size >= 64) { socket.destroy(); return }
    this.sockets.add(socket)
    const decoder = new NativeFrameDecoder()
    let authenticated = false
    let client: Client | undefined
    const timer = setTimeout(() => socket.destroy(), 10_000)
    const send = (message: unknown) => socket.write(encodeNativeFrame(message, 1024 * 1024))
    socket.on('data', data => {
      try {
        for (const value of decoder.push(Buffer.isBuffer(data) ? data : Buffer.from(data))) {
          const message = value as Record<string, unknown>
          if (!authenticated) {
            const a = Buffer.from(typeof message.token === 'string' ? message.token : '')
            const b = Buffer.from(this.deps.token)
            if (message.type !== 'host_auth' || message.origin !== `chrome-extension://${this.deps.extensionId}/` || a.length !== b.length || !timingSafeEqual(a, b)) {
              socket.end(encodeNativeFrame({ type: 'host_ready', ok: false })); return
            }
            authenticated = true; send({ type: 'host_ready', ok: true }); continue
          }
          if (!client) {
            if (!validHello(message)) { send({ type: 'hello_result', ok: false, protocolVersion: 1, error: 'VERSION_MISMATCH: update BS Coding and reload its extension' }); socket.end(); return }
            const hello = message as unknown as NativeHello
            if (this.disabled.has(hello.clientId)) { send({ type: 'hello_result', ok: false, protocolVersion: 1, error: 'CONNECTION_DISABLED: enable this profile in BS Coding Browser settings' }); socket.end(); return }
            const old = this.clients.get(hello.clientId)
            client = { id: hello.clientId, hello, socket, epoch: randomUUID() }
            this.clients.set(client.id, client)
            this.profiles.set(client.id, { label: hello.label, extensionVersion: hello.extensionVersion })
            old?.socket.destroy()
            this.selectedId ??= client.id
            this.persist()
            this.error = undefined; clearTimeout(timer)
            send({ type: 'hello_result', ok: true, protocolVersion: NATIVE_PROTOCOL_VERSION, epoch: client.epoch }); this.changed(); continue
          }
          if (message.type === 'ping') { send({ type: 'pong' }); continue }
          if (message.epoch !== client.epoch || typeof message.ownerId !== 'string') continue
          if (message.type === 'result') {
            const pending = this.pending.get(String(message.id))
            if (!pending || pending.client !== client || pending.ownerId !== message.ownerId) continue
            pending.finish(message.ok === true ? this.artifact(message.data) : { ok: false, error: typeof message.error === 'string' ? message.error.slice(0, 2000) : 'Browser command failed' })
          } else if (message.type === 'event' && this.ownerClients.get(message.ownerId) === client.id && (message.name === 'console' || message.name === 'network')) {
            const key = `${client.id}:${message.ownerId}`
            const logs = this.logs.get(key) ?? { console: [], network: [] }
            logs[message.name].push(message.data); logs[message.name] = logs[message.name].slice(-200); this.logs.set(key, logs)
          }
        }
      } catch { socket.destroy() }
    })
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      clearTimeout(timer); this.sockets.delete(socket)
      if (client && this.clients.get(client.id) === client) { this.clients.delete(client.id); this.changed() }
      for (const pending of this.pending.values()) if (pending.client.socket === socket) pending.finish({ ok: false, error: 'RESULT_UNKNOWN: browser disconnected; command will not be replayed' })
    })
  }
  private artifact(data: unknown): BrowserCommandResult {
    const object = data as Record<string, unknown> | undefined
    try {
      if (typeof object?.base64 === 'string' && this.deps.screenshotDir) {
        mkdirSync(this.deps.screenshotDir, { recursive: true })
        const file = path.join(this.deps.screenshotDir, `browser-${randomUUID()}.png`)
        writeFileSync(file, Buffer.from(object.base64, 'base64')); return { ok: true, data: { ...object, base64: undefined, path: file } }
      }
      if (Array.isArray(object?.tree) && this.deps.snapshotDir) {
        const tree = object.tree as SnapshotNode[]
        const text = snapshotToText(tree); mkdirSync(this.deps.snapshotDir, { recursive: true })
        const file = path.join(this.deps.snapshotDir, `browser-snapshot-${randomUUID()}.txt`)
        writeFileSync(file, text, 'utf8')
        return { ok: true, data: { ...object, tree: undefined, path: file, nodeCount: countSnapshotNodes(tree), size: Buffer.byteLength(text), preview: text.split('\n').slice(0, 80).join('\n') } }
      }
      return { ok: true, data }
    } catch { return { ok: false, error: 'Browser artifact could not be saved' } }
  }
}

function validHello(value: Record<string, unknown>): boolean {
  return value.type === 'hello' && value.protocolVersion === NATIVE_PROTOCOL_VERSION
    && typeof value.clientId === 'string' && /^[\w-]{1,100}$/.test(value.clientId)
    && typeof value.browserEpoch === 'string' && value.browserEpoch.length > 0 && value.browserEpoch.length <= 100
    && typeof value.extensionVersion === 'string' && value.extensionVersion.length <= 40
    && typeof value.label === 'string' && value.label.length > 0 && value.label.length <= 80
    && Array.isArray(value.capabilities) && NATIVE_CAPABILITIES.every(capability => (value.capabilities as unknown[]).includes(capability))
}
