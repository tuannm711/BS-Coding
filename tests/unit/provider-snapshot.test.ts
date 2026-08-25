import { describe, expect, it } from 'vitest'
import { buildProviderSnapshot, dedupeProviderModels } from '../../src/main/connections/snapshot'

describe('provider snapshot', () => {
  it('deduplicates canonical model ids and keeps the code-capable metadata', () => {
    expect(dedupeProviderModels([
      { id: 'gemini-3.1-pro-high', name: 'Alias', discoveredAt: 1, capabilities: { isCodeModel: false } },
      { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)', discoveredAt: 2, capabilities: { isCodeModel: true, supportsTools: true } },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', discoveredAt: 1, capabilities: { isCodeModel: true } }
    ])).toEqual([
      expect.objectContaining({ id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)', capabilities: expect.objectContaining({ isCodeModel: true }) }),
      expect.objectContaining({ id: 'claude-sonnet-4-6' })
    ])
  })

  it('deduplicates repeated account catalog aliases in the canonical snapshot', () => {
    const snapshot = buildProviderSnapshot(1, [], [{
      providerId: 'antigravity', activeAccountId: 'a1', accounts: [{
        id: 'a1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth', status: 'active',
        modelCatalog: [
          { id: 'gemini-3.1-pro-high', name: 'Alias', capabilities: { isCodeModel: false } },
          { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)', capabilities: { isCodeModel: true } }
        ],
        createdAt: 1, lastUsedAt: 2
      }]
    }], 3)

    expect(snapshot.accounts[0].models).toHaveLength(1)
    expect(snapshot.accounts[0].models[0]).toMatchObject({ id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' })
  })

  it('joins capability, account and model metadata in one revisioned snapshot', () => {
    const snapshot = buildProviderSnapshot(7, [{ id: 'antigravity', displayName: 'Antigravity IDE', description: 'Google', status: 'experimental', chatTransport: 'cloud-code', methods: [{ id: 'oauth', label: 'OAuth', description: '', kind: 'oauth', fields: [] }] }], [{ providerId: 'antigravity', activeAccountId: 'a1', accounts: [{ id: 'a1', providerId: 'antigravity', label: 'a@example.com', authMode: 'oauth', status: 'active', models: ['gemini-3.1-pro-high'], createdAt: 1, lastUsedAt: 2 }] }], 9)
    expect(snapshot.revision).toBe(7)
    expect(snapshot.accounts[0].models[0].id).toBe('gemini-3.1-pro-high')
    expect(snapshot.providers[0].capabilities.modelDiscovery).toBe('remote')
    expect(snapshot.updatedAt).toBe(9)
    expect(snapshot).not.toHaveProperty('connections')
  })

  it('preserves remotely discovered model display names and capabilities', () => {
    const snapshot = buildProviderSnapshot(3, [{ id: 'antigravity', displayName: 'Antigravity IDE', status: 'experimental', chatTransport: 'cloud-code', methods: [] }], [{
      providerId: 'antigravity',
      activeAccountId: 'a1',
      accounts: [{
        id: 'a1', providerId: 'antigravity', label: 'pro@example.com', authMode: 'oauth', status: 'active',
        models: ['gemini-3.1-pro-high'],
        modelCatalog: [{ id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)', capabilities: { isCodeModel: true, supportsTools: true } }],
        createdAt: 1, lastUsedAt: 2
      }]
    }], 9, new Set(['antigravity']))

    expect(snapshot.accounts[0].models).toEqual([expect.objectContaining({
      id: 'gemini-3.1-pro-high',
      name: 'Gemini 3.1 Pro (High)',
      capabilities: expect.objectContaining({ isCodeModel: true, supportsTools: true })
    })])
    expect(snapshot.providers[0].capabilities).toMatchObject({ modelDiscovery: 'remote', usage: 'supported' })
  })
})
