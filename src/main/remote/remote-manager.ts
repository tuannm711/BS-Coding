import type { WebSocket } from 'ws'
import type { RemoteSettingsStore } from './remote-settings'
import type { RemotePairing } from './remote-pairing'
import type { RemoteCommandContext } from './remote-commands'
import { dispatchRemoteCommand } from './remote-commands'
import { RemoteRelayClient, type RelayClientDeps, type RelayStatus } from './remote-relay-client'
import type { RemoteEvent, RemoteStatus } from '../../shared/remote-types'
import type { ChatEvent } from '../../shared/types'

export interface RemoteManagerDeps {
  store: RemoteSettingsStore
  pairing: RemotePairing
  context?: RemoteCommandContext
  dispatch?: RelayClientDeps['dispatch']
  onAgentEvent?: (e: ChatEvent) => void
  wsImpl?: new (url: string) => WebSocket
  createClient?: (deps: RelayClientDeps) => RemoteRelayClient
}

export class RemoteManager {
  private enabled: boolean
  private client: RemoteRelayClient | null = null
  private clientUnsub: (() => void) | null = null
  private clientStatus: RelayStatus = { connected: false, paired: false }
  private pairingCode: string | undefined
  private pairingExpiresAt: number | undefined
  private listeners = new Set<(s: RemoteStatus) => void>()
  private dispatchOverride: RelayClientDeps['dispatch'] | null = null

  constructor(private deps: RemoteManagerDeps) {
    const settings = this.deps.store.load()
    this.enabled = settings.enabled
    this.deps.pairing.setToken(settings.sessionToken ?? '')
    if (this.enabled) {
      try {
        this.connectClient()
      } catch (error) {
        this.enabled = false
        this.deps.store.save({ ...settings, enabled: false })
        this.clientStatus = { connected: false, paired: false,
          error: error instanceof Error ? error.message : 'secure relay configuration is invalid' }
      }
    }
  }

  getStatus(): RemoteStatus {
    const settings = this.deps.store.load()
    return {
      enabled: this.enabled,
      connected: this.clientStatus.connected,
      paired: this.clientStatus.paired,
      deviceId: settings.deviceId,
      ...(this.clientStatus.deviceId ? { mobileDeviceId: this.clientStatus.deviceId } : {}),
      relayUrl: settings.relayUrl,
      ...(this.pairingCode !== undefined ? { pairingCode: this.pairingCode } : {}),
      ...(this.pairingExpiresAt !== undefined ? { pairingExpiresAt: this.pairingExpiresAt } : {}),
      ...(this.clientStatus.error !== undefined ? { error: this.clientStatus.error } : {})
    }
  }

  setEnabled(enabled: boolean): void {
    const settings = this.deps.store.load()
    if (enabled) validateRelayUrl(settings.relayUrl)
    this.enabled = enabled
    this.deps.store.save({ ...settings, enabled })
    if (enabled) {
      this.connectClient()
    } else {
      this.closeClient()
      this.deps.pairing.reset()
      this.pairingCode = undefined
      this.pairingExpiresAt = undefined
    }
    this.emitStatus()
  }

  setRelayUrl(url: string): void {
    validateRelayUrl(url)
    const settings = this.deps.store.load()
    this.deps.store.save({ ...settings, relayUrl: url })
    if (!this.enabled) return
    this.closeClient()
    this.connectClient()
    this.emitStatus()
  }

  startPairing(): { code: string; expiresAt: number } | null {
    if (!this.enabled || !this.client || !this.clientStatus.connected) return null
    const p = this.client.startPairing()
    this.pairingCode = p.code
    this.pairingExpiresAt = p.expiresAt
    this.emitStatus()
    return p
  }

  revokeToken(): void {
    this.client?.revokeToken()
    this.deps.pairing.revokeToken()
    const settings = this.deps.store.load()
    const next = { ...settings }
    delete next.sessionToken
    this.deps.store.save(next)
    this.pairingCode = undefined
    this.pairingExpiresAt = undefined
    this.emitStatus()
  }

  revokeDevice(deviceId: string): boolean {
    const revoked = this.client?.revokeDevice(deviceId) ?? false
    if (!revoked) return false
    this.deps.pairing.revokeToken()
    const settings = this.deps.store.load()
    const next = { ...settings }
    delete next.sessionToken
    this.deps.store.save(next)
    this.pairingCode = undefined
    this.pairingExpiresAt = undefined
    this.emitStatus()
    return true
  }

  setDispatcher(dispatch: RelayClientDeps['dispatch']): void {
    this.dispatchOverride = dispatch
  }

  handleAgentEvent(e: ChatEvent): void {
    this.client?.sendEvent(this.mapEvent(e))
  }

  onStatusChange(cb: (s: RemoteStatus) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  dispose(): void {
    this.closeClient()
    this.deps.pairing.reset()
    this.emitStatus()
    this.listeners.clear()
  }

  private connectClient(): void {
    if (this.client) return
    const settings = this.deps.store.load()
    validateRelayUrl(settings.relayUrl)
    if (!this.resolveDispatcher()) throw new Error('remote command dispatcher is required')
    const client = (this.deps.createClient ?? ((deps: RelayClientDeps) => new RemoteRelayClient(deps)))({
      url: settings.relayUrl,
      deviceId: settings.deviceId,
      pairing: this.deps.pairing,
      dispatch: (name, params) => {
        const dispatch = this.resolveDispatcher()
        return dispatch ? dispatch(name, params)
          : Promise.resolve({ ok: false, error: 'remote command dispatcher is unavailable' })
      },
      wsImpl: this.deps.wsImpl,
      onPairOk: (token) => {
        const current = this.deps.store.load()
        this.deps.store.save({ ...current, sessionToken: token })
      }
    })
    this.client = client
    this.clientUnsub = client.onStatusChange(status => {
      this.clientStatus = status
      this.emitStatus()
    })
    try {
      client.connect()
    } catch (err) {
      this.clientStatus = { ...this.clientStatus, error: String(err) }
    }
  }

  private closeClient(): void {
    this.clientUnsub?.()
    this.clientUnsub = null
    this.client?.close()
    this.client = null
    this.clientStatus = { connected: false, paired: false }
  }

  private mapEvent(e: ChatEvent): RemoteEvent {
    if ('sessionId' in e && typeof e.sessionId === 'string') return { type: 'chat:event', event: e }
    if (e.type === 'turn-started') {
      return {
        type: 'agent:state',
        agentId: e.agentId,
        running: true,
        background: this.deps.context?.bsAgent.isBackground(e.agentId) ?? false
      }
    }
    if (e.type === 'done' || e.type === 'error') {
      return {
        type: 'agent:state',
        agentId: e.agentId,
        running: false,
        background: this.deps.context?.bsAgent.isBackground(e.agentId) ?? false
      }
    }
    return { type: 'chat:event', event: e }
  }

  private resolveDispatcher(): RelayClientDeps['dispatch'] | null {
    return this.dispatchOverride ?? this.deps.dispatch
      ?? (this.deps.context
        ? ((name, params) => dispatchRemoteCommand(name, params, this.deps.context!))
        : null)
  }

  private emitStatus(): void {
    const status = this.getStatus()
    for (const cb of this.listeners) cb(status)
  }
}

function validateRelayUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('secure relay URL is required')
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
    || url.hostname === '[::1]' || url.hostname === '::1'
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) {
    throw new Error('secure relay requires wss:// or a loopback ws:// URL')
  }
}
