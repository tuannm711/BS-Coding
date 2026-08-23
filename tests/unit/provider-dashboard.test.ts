import { describe, expect, it } from 'vitest'
import { groupProviderAccounts } from '../../src/renderer/src/components/settings/ProvidersTab'
import type { ProviderSnapshot } from '../../src/shared/provider-state'

describe('provider dashboard grouping', () => {
  it('groups connected accounts by provider definition and hides empty providers', () => {
    const snapshot: ProviderSnapshot = {
      revision: 1, updatedAt: 1, assignments: [], connections: [],
      providers: [
        { id: 'openai', displayName: 'OpenAI', description: '', methods: [], capabilities: { modelDiscovery: 'account', runtime: 'oauth', usage: 'supported' } },
        { id: 'antigravity', displayName: 'Antigravity', description: '', methods: [], capabilities: { modelDiscovery: 'account', runtime: 'oauth', usage: 'supported' } }
      ],
      accounts: [{ id: 'a1', providerId: 'antigravity', label: 'a@example.com', authMode: 'oauth', status: 'active', models: [], updatedAt: 1 }]
    }
    expect(groupProviderAccounts(snapshot).map(group => [group.provider.id, group.accounts.map(account => account.id)])).toEqual([['antigravity', ['a1']]])
  })
})
