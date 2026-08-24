import { describe, expect, it } from 'vitest'
import {
  extractOpenAISubscriptionMetadata,
  normalizeOpenAICodexUsage,
  normalizeResetAt,
  normalizeUsage,
  retainLastKnownUsage,
  selectTrackedPeriod,
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

  it('selects weekly first, then the longest reported window, then a local period', () => {
    const usage = {
      accountId: 'a', refreshedAt: 1, source: 'provider' as const, status: 'ok' as const,
      quotaGroups: [{ id: 'g', label: 'Group', modelIds: [], windows: [
        { id: 'short', label: 'Session', kind: 'session' as const, resetAt: 10_000, windowMinutes: 300, remainingPercent: 90, usageKnown: true, source: 'provider' as const },
        { id: 'weekly', label: 'Weekly', kind: 'weekly' as const, resetAt: 20_000, windowMinutes: 10_080, remainingPercent: 80, usageKnown: true, source: 'provider' as const }
      ] }]
    }
    expect(selectTrackedPeriod(usage, 500)).toEqual({ key: 'weekly:20000', start: 20_000 - 10_080 * 60_000, end: 20_000 })
    expect(selectTrackedPeriod({ ...usage, quotaGroups: [{ ...usage.quotaGroups[0], windows: usage.quotaGroups[0].windows.slice(0, 1) }] }, 500)).toEqual({ key: 'session:10000', start: 10_000 - 300 * 60_000, end: 10_000 })
    expect(selectTrackedPeriod(undefined, 500)).toEqual({ key: 'local:500', start: 500 })
  })

  it('retains last-known-good quota as stale when refresh fails', () => {
    const previous = normalizeOpenAICodexUsage('a', { rate_limit: { primary_window: { used_percent: 20, reset_at: 1_800_000_000, limit_window_seconds: 18_000 } } }, 1_700_000_000_000)
    const stale = retainLastKnownUsage(previous, new Error('network down'), 1_700_000_100_000)

    expect(stale).toMatchObject({
      quotaGroups: previous.quotaGroups,
      stale: true,
      refreshError: 'Error: network down',
      lastSuccessfulRefreshAt: previous.refreshedAt,
      refreshedAt: 1_700_000_100_000
    })
  })
})
