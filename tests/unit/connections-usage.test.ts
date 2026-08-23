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
    expect(usage.resetAt).toBe(123_000)
    expect(usage.quotaGroups).toEqual([{
      id: 'openai-base',
      label: 'Codex',
      modelIds: [],
      windows: [
        { id: 'primary', label: 'Session', kind: 'session', remainingPercent: 58, resetAt: 123_000, usageKnown: true, source: 'provider' },
        { id: 'secondary', label: 'Weekly', kind: 'weekly', remainingPercent: 82, resetAt: 456_000, usageKnown: true, source: 'provider' }
      ]
    }])
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
    expect(usage.resetAt).toBe(123_000)
    expect(usage.status).toBe('ok')
    expect(usage.quotaGroups?.[0].windows).toEqual([
      { id: 'primary', label: '5-hour', kind: 'session', remainingPercent: 58, resetAt: 123_000, windowMinutes: 300, usageKnown: true, source: 'provider' },
      { id: 'secondary', label: 'Weekly', kind: 'weekly', remainingPercent: 82, resetAt: expect.any(Number), windowMinutes: 10_080, usageKnown: true, source: 'provider' }
    ])
  })

  it('does not synthesize a secondary window when OpenAI only reports primary', () => {
    const usage = normalizeOpenAICodexUsage('a', {
      rate_limit: { primary_window: { used_percent: 40, reset_at: 1_800_000_000, limit_window_seconds: 18_000 } }
    }, 1_700_000_000_000)

    expect(usage.quotaGroups?.[0].windows).toEqual([
      { id: 'primary', label: '5-hour', kind: 'session', remainingPercent: 60, resetAt: 1_800_000_000_000, windowMinutes: 300, usageKnown: true, source: 'provider' }
    ])
  })

  it('preserves additional OpenAI rate limits as separate stable groups', () => {
    const usage = normalizeOpenAICodexUsage('a', {
      rate_limit: { primary_window: { used_percent: 42, limit_window_seconds: 18_000 } },
      additional_rate_limits: [{
        limit_name: 'Code review',
        rate_limit: { primary_window: { used_percent: 25, reset_after_seconds: 90 } }
      }]
    }, 1_700_000_000_000)

    expect(usage.quotaGroups).toEqual([
      {
        id: 'openai-base', label: 'Codex', modelIds: [], windows: [
          { id: 'primary', label: '5-hour', kind: 'session', remainingPercent: 58, windowMinutes: 300, usageKnown: true, source: 'provider' }
        ]
      },
      {
        id: 'openai-code-review', label: 'Code review', modelIds: [], windows: [
          { id: 'code-review-primary', label: 'Additional limit', kind: 'additional', remainingPercent: 75, resetAt: 1_700_000_090_000, usageKnown: true, source: 'provider' }
        ]
      }
    ])
  })

  it('extracts plan and subscription expiry from nested account responses', () => {
    expect(extractOpenAISubscriptionMetadata({ account: { plan_type: 'plus', subscription_active_until: 1_800_000_000 } })).toEqual({ planName: 'plus', subscriptionExpiresAt: 1_800_000_000_000 })
  })

  it('does not confuse OAuth token expiry with subscription expiry', () => {
    expect(extractOpenAISubscriptionMetadata({ oauth: { expires_at: 1_800_000_000 }, account: { plan_type: 'pro' } })).toEqual({ planName: 'pro' })
  })
})
