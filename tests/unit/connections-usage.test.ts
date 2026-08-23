import { describe, expect, it } from 'vitest'
import { extractOpenAISubscriptionMetadata, normalizeOpenAICodexUsage, normalizeUsage } from '../../src/main/connections/usage'

describe('provider usage normalization', () => {
  it('marks usage near limit at 90 percent', () => {
    expect(normalizeUsage({ accountId: 'a', tokensUsed: 90, tokenLimit: 100, refreshedAt: 1 }).status).toBe('near-limit')
  })

  it('maps Codex usage fields', () => {
    expect(normalizeOpenAICodexUsage('a', { usage: { requests: 2, tokens: 20 }, limit: { requests: 10, tokens: 100 }, reset_at: 123 }).tokensUsed).toBe(20)
  })

  it('maps Codex rate-limit windows to account-level percentages', () => {
    const usage = normalizeOpenAICodexUsage('a', {
      rate_limits: {
        primary: { used_percent: 42, reset_at: 123 },
        secondary: { used_percent: 18, reset_at: 456 }
      }
    })
    expect(usage.primaryUsedPercent).toBe(42)
    expect(usage.secondaryUsedPercent).toBe(18)
    expect(usage.resetAt).toBe(123)
  })

  it('maps the ChatGPT wham usage response shape', () => {
    const usage = normalizeOpenAICodexUsage('a', {
      plan_type: 'plus',
      rate_limit: {
        primary_window: { used_percent: 42, reset_at: 123, limit_window_seconds: 18000 },
        secondary_window: { used_percent: 18, reset_after_seconds: 3600, limit_window_seconds: 604800 }
      }
    })
    expect(usage.primaryUsedPercent).toBe(42)
    expect(usage.secondaryUsedPercent).toBe(18)
    expect(usage.resetAt).toBe(123)
    expect(usage.status).toBe('ok')
  })

  it('extracts plan and subscription expiry from nested account responses', () => {
    expect(extractOpenAISubscriptionMetadata({ account: { plan_type: 'plus', subscription_active_until: 1_800_000_000 } })).toEqual({ planName: 'plus', subscriptionExpiresAt: 1_800_000_000_000 })
  })
})
