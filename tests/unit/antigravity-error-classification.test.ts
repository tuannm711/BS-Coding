import { describe, expect, it } from 'vitest'
import { classifyProviderError } from '../../src/shared/provider-state'

describe('Antigravity error classification', () => {
  it('keeps quota, capacity and auth states distinct', () => {
    expect(classifyProviderError(429, 'RESOURCE_EXHAUSTED').kind).toBe('quota-exhausted')
    expect(classifyProviderError(429, 'MODEL_CAPACITY_EXHAUSTED').kind).toBe('capacity-exhausted')
    expect(classifyProviderError(503, 'MODEL_OUT_OF_COMPUTE').kind).toBe('unavailable')
    expect(classifyProviderError(403, 'token expired').kind).toBe('auth')
  })
})
