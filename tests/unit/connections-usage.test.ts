import { describe, expect, it } from 'vitest'
import {
  extractOpenAISubscriptionMetadata,
  normalizeOpenAICodexUsage,
  normalizeResetAt,
  normalizeUsage,
  toRemainingPercent
} from '../../src/main/connections/usage'

describe('provider usage normalization', () => {
  it('normalizes provider reset timestamps to JavaScript milliseconds', () => {
    const now = 1_700_000_000_000
    expect(normalizeResetAt(1_800_000_000, now)).toBe(1_800_000_000_000)
    expect(normalizeResetAt(1_800_000_000_000, now)).toBe(1_800_000_000_000)
    expect(normalizeResetAt('2030-01-01T00:00:00.000Z', now)).toBe(Date.parse('2030-01-01T00:00:00.000Z'))
    expect(normalizeResetAt(undefined, now, 120)).toBe(now + 120_000)
    expect(normalizeResetAt('not-a-date', now)).toBeUndefined()
  })

  it('converts used quota to a clamped remaining percentage', () => {
    expect(toRemainingPercent(42)).toBe(58)
    expect(toRemainingPercent(-5)).toBe(100)
    expect(toRemainingPercent(150)).toBe(0)
    expect(toRemainingPercent(undefined)).toBeUndefined()
  })

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
