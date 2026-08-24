import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Channels, type AgentApi } from '../../src/shared/ipc'

describe('provider state IPC contract', () => {
  it('exposes the canonical provider snapshot and assignment methods', () => {
    const methods: Array<keyof AgentApi> = [
      'getProviderSnapshot', 'refreshProviderAccount', 'getAgentAssignmentSnapshot',
      'setAgentAssignmentSnapshot', 'onProviderSnapshotChanged', 'onAgentAssignmentChanged'
    ]
    expect(methods).toHaveLength(6)
    expect(Channels.ProviderSnapshotGet).toBe('provider:snapshot-get')
    expect(Channels.ProviderAccountRefresh).toBe('provider:account-refresh')
    expect(Channels.AgentAssignmentGetSnapshot).toBe('agent:assignment-get-snapshot')
    expect(Channels.AgentAssignmentSetSnapshot).toBe('agent:assignment-set-snapshot')
  })

  it('exposes provider authorization sessions without accepting browser URLs', () => {
    const methods: Array<keyof AgentApi> = [
      'createProviderAuthorization',
      'getProviderAuthorization',
      'openProviderAuthorization',
      'cancelProviderAuthorization',
      'onProviderAuthorizationChanged'
    ]
    expect(methods).toHaveLength(5)
    expect(Channels.ProviderAuthorizationCreate).toBe('provider:authorization-create')
    expect(Channels.ProviderAuthorizationGet).toBe('provider:authorization-get')
    expect(Channels.ProviderAuthorizationOpen).toBe('provider:authorization-open')
    expect(Channels.ProviderAuthorizationCancel).toBe('provider:authorization-cancel')
    expect(Channels.EventProviderAuthorizationChanged).toBe('provider:authorization-changed')
  })

  it('wires every canonical channel through preload and main handlers', () => {
    const root = path.resolve(__dirname, '../..')
    const preload = readFileSync(path.join(root, 'src/preload/index.ts'), 'utf-8')
    const main = readFileSync(path.join(root, 'src/main/index.ts'), 'utf-8')
    for (const channel of ['ProviderSnapshotGet', 'ProviderAccountRefresh', 'AgentAssignmentGetSnapshot', 'AgentAssignmentSetSnapshot']) {
      expect(preload).toContain(`Channels.${channel}`)
      expect(main).toContain(`ipcMain.handle(Channels.${channel}`)
    }
    expect(preload).toContain('Channels.EventProviderSnapshotChanged')
    expect(preload).toContain('Channels.EventAgentAssignmentChanged')
    for (const channel of ['ProviderAuthorizationCreate', 'ProviderAuthorizationGet', 'ProviderAuthorizationOpen', 'ProviderAuthorizationCancel']) {
      expect(preload).toContain(`Channels.${channel}`)
      expect(main).toContain(`ipcMain.handle(Channels.${channel}`)
    }
    expect(preload).toContain('Channels.EventProviderAuthorizationChanged')
  })
})
