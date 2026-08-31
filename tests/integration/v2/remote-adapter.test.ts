import { describe, expect, it, vi } from 'vitest'
import { RemoteManager } from '../../../src/main/remote/remote-manager'
import { RemotePairing } from '../../../src/main/remote/remote-pairing'
import { RemoteSettingsStore } from '../../../src/main/remote/remote-settings'
import type { RelayClientDeps } from '../../../src/main/remote/remote-relay-client'
import { V1RemoteAdapter } from '../../../src/main/v2/infrastructure/remote/v1-remote-adapter'

function remoteEdge() {
  let listener: ((status: ReturnType<typeof getStatus>) => void) | null = null
  let status = {
    enabled: true, connected: true, paired: true, deviceId: 'desktop-1',
    mobileDeviceId: 'phone-1'
  }
  const getStatus = () => ({ ...status })
  return {
    edge: {
      getStatus,
      setEnabled: vi.fn((enabled: boolean) => { status = { ...status, enabled } }),
      setRelayUrl: vi.fn(),
      startPairing: vi.fn(() => ({ code: '482731', expiresAt: Date.parse('2026-09-01T00:05:00.000Z') })),
      revokeDevice: vi.fn((id: string) => id === status.mobileDeviceId),
      onStatusChange: vi.fn((callback: typeof listener) => { listener = callback; return () => { listener = null } })
    },
    emit(next: typeof status) { status = next; listener?.(getStatus()) }
  }
}

describe('V2 remote transport adapter', () => {
  it('preserves V2 approval responses and audits privileged commands without params', async () => {
    const remote = remoteEdge()
    const execute = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'APPROVAL_REQUIRED', message: 'confirm cancellation' }
    }))
    const audits: unknown[] = []
    const adapter = new V1RemoteAdapter(remote.edge, { execute }, {
      record: async event => { audits.push(event) }
    }, () => '2026-09-01T00:00:00.000Z')

    const result = await adapter.dispatch('workSession:cancel', {
      requestId: 'request-1', input: { projectId: 'p1', workSessionId: 'ws1' },
      token: 'must-not-enter-audit'
    })

    expect(result).toEqual({
      ok: false, error: { code: 'APPROVAL_REQUIRED', message: 'confirm cancellation' }
    })
    expect(execute).toHaveBeenCalledWith('workSession.cancel', {
      requestId: 'request-1', input: { projectId: 'p1', workSessionId: 'ws1' },
      token: 'must-not-enter-audit'
    })
    expect(audits).toEqual([
      { type: 'CONNECTION', state: 'CONNECTED', deviceId: 'phone-1',
        timestamp: '2026-09-01T00:00:00.000Z' },
      { type: 'PRIVILEGED_COMMAND', command: 'workSession.cancel', deviceId: 'phone-1',
        timestamp: '2026-09-01T00:00:00.000Z' }
    ])
    expect(JSON.stringify(audits)).not.toContain('must-not-enter-audit')
  })

  it('maps paired device status, revokes that device and audits connection changes', async () => {
    const remote = remoteEdge()
    const audits: unknown[] = []
    const adapter = new V1RemoteAdapter(remote.edge, { execute: async () => ({ ok: true }) }, {
      record: async event => { audits.push(event) }
    }, () => '2026-09-01T00:00:00.000Z')

    await expect(adapter.getStatus()).resolves.toEqual({
      enabled: true, state: 'CONNECTED',
      devices: [{ id: 'phone-1', name: 'phone-1', status: 'ONLINE' }]
    })
    await adapter.revokeDevice('phone-1')
    expect(remote.edge.revokeDevice).toHaveBeenCalledWith('phone-1')

    remote.emit({ enabled: true, connected: true, paired: false,
      deviceId: 'desktop-1', mobileDeviceId: 'phone-1' })
    await vi.waitFor(() => expect(audits).toContainEqual({
      type: 'CONNECTION', state: 'CONNECTING', deviceId: 'phone-1',
      timestamp: '2026-09-01T00:00:00.000Z'
    }))
    adapter.dispose()
  })

  it('rejects unsupported commands before reaching the V2 dispatcher', async () => {
    const remote = remoteEdge()
    const execute = vi.fn()
    const adapter = new V1RemoteAdapter(remote.edge, { execute }, { record: async () => {} })

    await expect(adapter.dispatch('chat:send', { text: 'bypass' })).resolves.toEqual({
      ok: false,
      error: { code: 'REMOTE_COMMAND_UNSUPPORTED', message: 'remote command is not allowed' }
    })
    expect(execute).not.toHaveBeenCalled()
    adapter.dispose()
  })

  it('injects the V2 dispatcher into RemoteManager and rejects insecure relay URLs', async () => {
    let settings = { enabled: false, relayUrl: 'ws://relay.example', deviceId: 'desktop-1' }
    const store = new RemoteSettingsStore({
      load: () => [settings], save: values => { settings = values[0] }
    })
    let captured: RelayClientDeps | null = null
    const initialDispatch = vi.fn(async () => ({ ok: false as const, error: 'V2 not ready' }))
    const dispatch = vi.fn(async () => ({ ok: true as const, result: ['p1'] }))
    const manager = new RemoteManager({
      store, pairing: new RemotePairing(), dispatch: initialDispatch,
      createClient: deps => {
        captured = deps
        return { connect() {}, close() {}, onStatusChange: () => () => {},
          sendEvent() {}, startPairing: () => ({ code: '123456', expiresAt: 1 }),
          revokeToken() {} } as never
      }
    })

    expect(() => manager.setEnabled(true)).toThrow(/secure relay/i)
    manager.setRelayUrl('ws://127.0.0.1:4567')
    manager.setEnabled(true)
    manager.setDispatcher(dispatch)
    await expect(captured!.dispatch('workspace:list', {})).resolves.toEqual({ ok: true, result: ['p1'] })
    expect(dispatch).toHaveBeenCalledWith('workspace:list', {})
    expect(initialDispatch).not.toHaveBeenCalled()
    manager.dispose()
  })
})
