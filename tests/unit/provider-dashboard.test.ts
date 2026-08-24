import { describe, expect, it } from 'vitest'
import { availableProviderMethods, reconnectMethodId } from '../../src/renderer/src/components/settings/AddProviderModal'
import { groupProviderAccounts } from '../../src/renderer/src/components/settings/ProvidersTab'
import type { ProviderSnapshot } from '../../src/shared/provider-state'

describe('provider dashboard grouping', () => {
  it('groups connected accounts by provider definition and hides empty providers', () => {
    const snapshot: ProviderSnapshot = {
      revision: 1, updatedAt: 1, assignments: [],
      providers: [
        { id: 'openai', displayName: 'OpenAI', description: '', methods: [], capabilities: { modelDiscovery: 'account', runtime: 'oauth', usage: 'supported' } },
        { id: 'antigravity', displayName: 'Antigravity', description: '', methods: [], capabilities: { modelDiscovery: 'account', runtime: 'oauth', usage: 'supported' } }
      ],
      accounts: [{ id: 'a1', providerId: 'antigravity', label: 'a@example.com', authMode: 'oauth', status: 'active', models: [], updatedAt: 1 }]
    }
    expect(groupProviderAccounts(snapshot).map(group => [group.provider.id, group.accounts.map(account => account.id)])).toEqual([['antigravity', ['a1']]])
  })

  it('renders connection methods from provider descriptors', () => {
    const providers: ProviderSnapshot['providers'] = [{
      id: 'openai', displayName: 'OpenAI', description: '', capabilities: { modelDiscovery: 'account', runtime: 'oauth', usage: 'supported' },
      methods: [
        { id: 'oauth', label: 'OAuth sign-in', kind: 'oauth', fields: [] },
        { id: 'api-key', label: 'API key', kind: 'api-key', fields: ['apiKey', 'baseUrl'] }
      ]
    }]
    expect(availableProviderMethods(providers, 'openai').map(method => method.id)).toEqual(['oauth', 'api-key'])
    expect(reconnectMethodId(providers[0], 'oauth')).toBe('oauth')
    expect(reconnectMethodId(providers[0], 'api-key')).toBe('api-key')
  })
})
