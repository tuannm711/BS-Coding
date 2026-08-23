import { describe, expect, it } from 'vitest'
import { normalizeOpenAICodexUsage, normalizeUsage } from '../../src/main/connections/usage'

describe('provider usage normalization', () => {
  it('marks usage near limit at 90 percent', () => {
    expect(normalizeUsage({ accountId: 'a', tokensUsed: 90, tokenLimit: 100, refreshedAt: 1 }).status).toBe('near-limit')
  })

  it('maps Codex usage fields', () => {
    expect(normalizeOpenAICodexUsage('a', { usage: { requests: 2, tokens: 20 }, limit: { requests: 10, tokens: 100 }, reset_at: 123 }).tokensUsed).toBe(20)
  })
})
