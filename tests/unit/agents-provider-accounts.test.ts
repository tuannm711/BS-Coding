import { describe, expect, it } from 'vitest'
import { connectedProviderOptions } from '../../src/renderer/src/components/settings/AgentsTab'
import type { ProviderSnapshot } from '../../src/shared/provider-state'

describe('agent provider account model merge', () => {
  it('adds active Antigravity account models as an independent provider', () => {
    const snapshot: ProviderSnapshot = {
      revision: 1,
      updatedAt: 1,
      assignments: [],
      providers: [{ id: 'antigravity', displayName: 'Antigravity IDE', description: '', methods: [], capabilities: { modelDiscovery: 'remote', runtime: 'custom', usage: 'supported' } }],
      accounts: [{ id: 'a1', providerId: 'antigravity', label: 'a@example.com', authMode: 'oauth', status: 'active', models: [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', discoveredAt: 1 }], updatedAt: 1 }]
    }

    expect(connectedProviderOptions(snapshot).map(provider => provider.id)).toEqual(['antigravity'])
  })
})
