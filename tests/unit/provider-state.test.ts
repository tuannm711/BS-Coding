import { describe, expect, it } from 'vitest'
import { classifyProviderError, isAssignmentCompatible, shouldAcceptSnapshot, type ProviderSnapshot } from '../../src/shared/provider-state'

const snapshot: ProviderSnapshot = {
  revision: 4,
  providers: [{ id: 'antigravity', displayName: 'Antigravity IDE', description: '', methods: [], capabilities: { modelDiscovery: 'account', runtime: 'custom', usage: 'unavailable' } }],
  connections: [],
  accounts: [{ id: 'a1', providerId: 'antigravity', label: 'a@example.com', authMode: 'oauth', status: 'active', models: [{ id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)', discoveredAt: 1 }], updatedAt: 1 }],
  assignments: [],
  updatedAt: 1
}

describe('provider state contracts', () => {
  it('accepts an active account model assignment', () => {
    expect(isAssignmentCompatible({ providerId: 'antigravity', accountId: 'a1', modelId: 'gemini-3.1-pro-high' }, snapshot)).toBe(true)
  })

  it('rejects an assignment whose account is inactive or model is missing', () => {
    expect(isAssignmentCompatible({ providerId: 'antigravity', accountId: 'missing', modelId: 'gemini-3.1-pro-high' }, snapshot)).toBe(false)
    expect(isAssignmentCompatible({ providerId: 'antigravity', accountId: 'a1', modelId: 'missing' }, snapshot)).toBe(false)
  })

  it('classifies exhausted quota separately from capacity exhaustion', () => {
    expect(classifyProviderError(429, 'RESOURCE_EXHAUSTED').kind).toBe('quota-exhausted')
    expect(classifyProviderError(429, 'model capacity exhausted').kind).toBe('capacity-exhausted')
    expect(classifyProviderError(401, 'expired token').kind).toBe('auth')
  })

  it('rejects stale snapshot revisions', () => {
    expect(shouldAcceptSnapshot(8, 7)).toBe(false)
    expect(shouldAcceptSnapshot(8, 8)).toBe(true)
    expect(shouldAcceptSnapshot(8, 9)).toBe(true)
  })
})
