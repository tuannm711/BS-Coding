import { describe, expect, it } from 'vitest'
import { formatCountdown, formatExpiry, remainingPercent, usageRemaining } from '../../src/renderer/src/components/quota/quota-view'

describe('quota card view model', () => {
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
})
