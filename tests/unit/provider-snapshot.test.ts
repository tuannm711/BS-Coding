import { describe, expect, it } from 'vitest'
import { buildProviderSnapshot } from '../../src/main/connections/snapshot'

describe('provider snapshot', () => {
  it('joins capability, account and model metadata in one revisioned snapshot', () => {
    const snapshot = buildProviderSnapshot(7, [{ id: 'antigravity', displayName: 'Antigravity IDE', description: 'Google', status: 'experimental', methods: [{ id: 'oauth', label: 'OAuth', description: '', kind: 'oauth', fields: [] }] }], [{ providerId: 'antigravity', activeAccountId: 'a1', accounts: [{ id: 'a1', providerId: 'antigravity', label: 'a@example.com', authMode: 'oauth', status: 'active', models: ['gemini-3.1-pro-high'], createdAt: 1, lastUsedAt: 2 }] }], 9)
    expect(snapshot.revision).toBe(7)
    expect(snapshot.accounts[0].models[0].id).toBe('gemini-3.1-pro-high')
    expect(snapshot.providers[0].capabilities.modelDiscovery).toBe('account')
    expect(snapshot.updatedAt).toBe(9)
  })
})
