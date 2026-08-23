import { describe, expect, it } from 'vitest'
import { chatQuotaGroups, formatCountdown, formatExpiry, providerQuotaGroups, quotaWindowState, remainingPercent, usageRemaining } from '../../src/renderer/src/components/quota/quota-view'
import type { ProviderUsage } from '../../src/shared/types'

describe('quota card view model', () => {
  const groupedUsage: ProviderUsage = {
    accountId: 'a1', refreshedAt: 1, source: 'provider', status: 'ok',
    quotaGroups: [
      { id: 'gemini', label: 'Gemini Models', modelIds: ['gemini-3.1-pro-high'], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session', remainingPercent: 70, resetAt: 200, usageKnown: true, source: 'provider' }] },
      { id: 'claude-gpt', label: 'Claude and GPT models', modelIds: ['claude-sonnet-4-6'], windows: [{ id: '3p-weekly', label: 'Weekly', kind: 'weekly', remainingPercent: 30, resetAt: 300, usageKnown: true, source: 'provider' }] }
    ]
  }

  it('keeps every provider-native family for the Providers dashboard', () => {
    expect(providerQuotaGroups(groupedUsage).map(group => group.id)).toEqual(['gemini', 'claude-gpt'])
  })

  it('keeps only quota families matched by selected chat models', () => {
    expect(chatQuotaGroups(groupedUsage, ['claude-sonnet-4-6']).map(group => group.id)).toEqual(['claude-gpt'])
    expect(chatQuotaGroups(groupedUsage, ['gemini-3.1-pro-high', 'claude-sonnet-4-6']).map(group => group.id)).toEqual(['gemini', 'claude-gpt'])
  })

  it('maps only present legacy fields without fabricating a secondary window', () => {
    const groups = providerQuotaGroups({ accountId: 'a1', refreshedAt: 1, source: 'provider', status: 'ok', primaryUsedPercent: 40, resetAt: 200 })
    expect(groups).toEqual([{ id: 'legacy-base', label: 'Quota', modelIds: [], windows: [{ id: 'legacy-primary', label: 'Primary limit', kind: 'unknown', remainingPercent: 60, resetAt: 200, usageKnown: true, source: 'legacy-provider' }] }])
  })

  it('distinguishes exhausted, cooldown and unknown quota windows', () => {
    expect(quotaWindowState({ id: 'a', label: 'A', kind: 'session', remainingPercent: 0, resetAt: 200, usageKnown: true, source: 'provider' }, 100)).toBe('cooldown')
    expect(quotaWindowState({ id: 'a', label: 'A', kind: 'session', remainingPercent: 0, resetAt: 50, usageKnown: true, source: 'provider' }, 100)).toBe('exhausted')
    expect(quotaWindowState({ id: 'a', label: 'A', kind: 'unknown', usageKnown: false, source: 'provider' }, 100)).toBe('unknown')
  })

  it('shows remaining percentage instead of used percentage', () => {
    expect(remainingPercent(42)).toBe(58)
    expect(remainingPercent(120)).toBe(0)
  })

  it('formats reset and subscription countdowns deterministically', () => {
    const now = Date.UTC(2026, 7, 23, 10, 0, 0)
    expect(formatCountdown(now + (2 * 60 * 60 + 14 * 60) * 1000, now)).toBe('2h 14m')
    expect(formatExpiry(now + 3 * 86400000, now)).toBe('expires in 3d')
  })

  it('returns an empty view model when quota fields are unavailable', () => {
    expect(usageRemaining(undefined)).toEqual({ primary: undefined, secondary: undefined })
  })

  it('does not show healthy remaining quota while the provider reports quota exhaustion', () => {
    expect(usageRemaining({ accountId: 'a1', refreshedAt: 1, source: 'provider', status: 'ok', primaryUsedPercent: 0 }, 'quota-exhausted')).toEqual({ primary: 0, secondary: undefined })
  })
})
