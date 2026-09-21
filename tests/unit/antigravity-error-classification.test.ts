import { describe, expect, it } from 'vitest'
import { classifyProviderError } from '../../src/shared/provider-state'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'

describe('Provider error classification & Antigravity Deprecation', () => {
  it('classifies provider error states correctly', () => {
    expect(classifyProviderError(429, 'RESOURCE_EXHAUSTED').kind).toBe('quota-exhausted')
    expect(classifyProviderError(429, 'MODEL_CAPACITY_EXHAUSTED').kind).toBe('capacity-exhausted')
    expect(classifyProviderError(503, 'MODEL_OUT_OF_COMPUTE').kind).toBe('capacity-exhausted')
    expect(classifyProviderError(403, 'token expired').kind).toBe('auth')
  })

  it('legacy Antigravity adapter returns deprecated state on refresh', async () => {
    const adapter = createAntigravityAdapter()
    const account = { id: 'a1', providerId: 'antigravity', label: 'Legacy', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }

    const refreshed = await adapter.refreshAccount(account, {})
    expect(refreshed.status).toBe('error')
    expect(refreshed.lastError).toContain('ngừng hỗ trợ để tuân thủ ToS')
  })
})
