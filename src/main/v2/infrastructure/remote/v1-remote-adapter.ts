import type { PairingStatus, RemoteAuditEvent } from '../../../../shared/v2/contracts/remote'
import { PairingStatusSchema } from '../../../../shared/v2/schemas/remote'
import type { RemoteCmdResult } from '../../../../shared/remote-types'
import type { RemoteControlPort } from '../../application/ports/remote-control-port'

interface LegacyRemoteStatus {
  enabled: boolean
  connected: boolean
  paired: boolean
  deviceId: string
  mobileDeviceId?: string
  pairingCode?: string
  pairingExpiresAt?: number
  error?: string
}

interface LegacyRemoteEdge {
  getStatus(): LegacyRemoteStatus
  setEnabled(enabled: boolean): void
  startPairing(): { code: string; expiresAt: number } | null
  revokeDevice(deviceId: string): boolean
  onStatusChange(listener: (status: LegacyRemoteStatus) => void): () => void
}

interface V2CommandDispatcher {
  execute(name: string, input: unknown): Promise<unknown>
}

interface RemoteAuditSink {
  record(event: RemoteAuditEvent): Promise<void>
}

type RemoteDispatchResult = Omit<RemoteCmdResult, 'type' | 'id'>

const commandMap = Object.freeze({
  'project:list': 'project.list',
  'workSession:listByProject': 'workSession.listByProject',
  'workSession:create': 'workSession.create',
  'workSession:pause': 'workSession.pause',
  'workSession:resume': 'workSession.resume',
  'workSession:cancel': 'workSession.cancel',
  'workflow:approvePlan': 'workflow.approvePlan',
  'workflow:createRework': 'workflow.createRework',
  'agent:list': 'agent.list'
} as const)

const privileged = new Set<string>([
  'workSession.create', 'workSession.pause', 'workSession.resume', 'workSession.cancel',
  'workflow.approvePlan', 'workflow.createRework'
])

function iso(value: number): string {
  return new Date(value).toISOString()
}

function project(status: LegacyRemoteStatus): PairingStatus {
  const state: PairingStatus['state'] = status.error ? 'ERROR'
    : !status.enabled ? 'DISABLED'
      : status.paired ? 'CONNECTED'
        : status.connected && status.pairingCode ? 'PAIRING'
          : status.connected ? 'CONNECTING' : 'OFFLINE'
  return PairingStatusSchema.parse({
    enabled: status.enabled, state,
    ...(status.pairingCode && status.pairingExpiresAt
      ? { code: status.pairingCode, expiresAt: iso(status.pairingExpiresAt) } : {}),
    devices: status.mobileDeviceId ? [{
      id: status.mobileDeviceId, name: status.mobileDeviceId,
      status: status.paired ? 'ONLINE' : 'OFFLINE'
    }] : [],
    ...(status.error ? { message: status.error } : {})
  })
}

export class V1RemoteAdapter implements RemoteControlPort {
  private readonly listeners = new Set<(status: PairingStatus) => void>()
  private readonly unsubscribeLegacy: () => void

  constructor(
    private readonly legacy: LegacyRemoteEdge,
    private readonly dispatcher: V2CommandDispatcher,
    private readonly audit: RemoteAuditSink,
    private readonly now: () => string = () => new Date().toISOString()
  ) {
    this.unsubscribeLegacy = legacy.onStatusChange(status => {
      const mapped = project(status)
      this.recordConnection(status, mapped.state)
      for (const listener of this.listeners) listener(mapped)
    })
    const initial = legacy.getStatus()
    this.recordConnection(initial, project(initial).state)
  }

  async getStatus(): Promise<PairingStatus> {
    return project(this.legacy.getStatus())
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.legacy.setEnabled(enabled)
  }

  async startPairing(): Promise<PairingStatus> {
    const pairing = this.legacy.startPairing()
    if (!pairing) return this.getStatus()
    const current = this.legacy.getStatus()
    return PairingStatusSchema.parse({
      ...project({ ...current, pairingCode: pairing.code, pairingExpiresAt: pairing.expiresAt }),
      state: 'PAIRING', code: pairing.code, expiresAt: iso(pairing.expiresAt)
    })
  }

  async revokeDevice(deviceId: string): Promise<void> {
    if (!this.legacy.revokeDevice(deviceId)) throw new Error('unknown remote device')
  }

  subscribe(listener: (status: PairingStatus) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async dispatch(name: string, input: unknown): Promise<RemoteDispatchResult> {
    const mapped = commandMap[name as keyof typeof commandMap]
    if (!mapped) return { ok: false, error: {
      code: 'REMOTE_COMMAND_UNSUPPORTED', message: 'remote command is not allowed'
    } }
    if (privileged.has(mapped)) {
      const status = this.legacy.getStatus()
      await this.audit.record({ type: 'PRIVILEGED_COMMAND', command: mapped,
        ...(status.mobileDeviceId ? { deviceId: status.mobileDeviceId } : {}), timestamp: this.now() })
    }
    try {
      const result = await this.dispatcher.execute(mapped, input)
      if (result && typeof result === 'object' && typeof (result as { ok?: unknown }).ok === 'boolean') {
        return result as RemoteDispatchResult
      }
      return { ok: true, result }
    } catch (error) {
      return { ok: false, error: { code: 'V2_COMMAND_FAILED',
        message: error instanceof Error ? error.message : 'remote command failed' } }
    }
  }

  dispose(): void {
    this.unsubscribeLegacy()
    this.listeners.clear()
  }

  private recordConnection(status: LegacyRemoteStatus, state: PairingStatus['state']): void {
    void this.audit.record({ type: 'CONNECTION', state,
      ...(status.mobileDeviceId ? { deviceId: status.mobileDeviceId } : {}), timestamp: this.now() })
  }
}
