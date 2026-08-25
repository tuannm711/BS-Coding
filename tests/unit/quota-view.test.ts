import { describe, expect, it } from 'vitest'
import { accountWarning, chatQuotaGroups, formatCountdown, formatExpiry, formatInstant, hasRemainingQuota, providerQuotaGroups, quotaWindowState, remainingPercent, usageRemaining } from '../../src/renderer/src/components/quota/quota-view'
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

  it('formats an instant as zero-padded 24-hour local time', () => {
    expect(formatInstant(new Date(2026, 7, 25, 9, 5, 2).getTime())).toBe('09:05:02 25/08/2026')
    expect(formatInstant(new Date(2026, 11, 3, 19, 9, 2).getTime())).toBe('19:09:02 03/12/2026')
  })

  it('returns a dash when no instant is known', () => {
    expect(formatInstant(undefined)).toBe('—')
    expect(formatInstant(Number.NaN)).toBe('—')
  })

  it('reports remaining quota when any window is above zero', () => {
    expect(hasRemainingQuota(groupedUsage)).toBe(true)
    expect(hasRemainingQuota(undefined)).toBe(false)
  })

  it('reports no remaining quota when every window is at zero', () => {
    const drained: ProviderUsage = { ...groupedUsage, quotaGroups: groupedUsage.quotaGroups!.map(group => ({ ...group, windows: group.windows.map(window => ({ ...window, remainingPercent: 0 })) })) }
    expect(hasRemainingQuota(drained)).toBe(false)
  })

  it('hides an exhaustion warning while some group still has quota', () => {
    expect(accountWarning({ ...groupedUsage, unavailableReason: 'Quota exhausted' })).toBeUndefined()
    expect(accountWarning({ ...groupedUsage, unavailableReason: 'Model capacity exhausted' })).toBeUndefined()
  })

  it('keeps an exhaustion warning when every group is drained', () => {
    const drained: ProviderUsage = { ...groupedUsage, unavailableReason: 'Quota exhausted', quotaGroups: groupedUsage.quotaGroups!.map(group => ({ ...group, windows: group.windows.map(window => ({ ...window, remainingPercent: 0 })) })) }
    expect(accountWarning(drained)).toBe('Quota exhausted')
  })

  it('never hides a refresh error or a non-exhaustion reason', () => {
    expect(accountWarning({ ...groupedUsage, refreshError: 'boom', unavailableReason: 'Quota exhausted' })).toBe('boom')
    expect(accountWarning({ ...groupedUsage, unavailableReason: 'Authentication expired' })).toBe('Authentication expired')
  })
})
