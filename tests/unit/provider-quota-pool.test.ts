import { describe, expect, it } from 'vitest'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'
import { createGoogleAdapter } from '../../src/main/providers/adapters/google'
import { antigravityQuotaGroupForModel } from '../../src/main/providers/antigravity-models'

describe('quotaGroupForModel & Provider Pool Mapping', () => {
  it('classifies models into quota groups', () => {
    expect(antigravityQuotaGroupForModel('gemini-3.6-flash')).toBe('gemini')
    expect(antigravityQuotaGroupForModel('claude-opus-4-5')).toBe('claude-gpt')
    expect(antigravityQuotaGroupForModel('claude-sonnet-4-6')).toBe('claude-gpt')
  })

  it('returns undefined for unknown models', () => {
    expect(antigravityQuotaGroupForModel('something-new')).toBeUndefined()
  })

  it('exposes OpenAI and Google adapters cleanly', () => {
    expect(createOpenAiAdapter().capability.id).toBe('openai')
    expect(createGoogleAdapter().capability.id).toBe('google')
  })
})
