import { describe, expect, it } from 'vitest'
import { resetCreditGate } from '../../src/shared/reset-credit'
import type { ProviderUsage } from '../../src/shared/types'

const usage = (patch: Partial<ProviderUsage>): ProviderUsage =>
  ({ accountId: 'a1', refreshedAt: 1, source: 'provider', status: 'ok', ...patch })

const weekly = (remainingPercent?: number) => usage({
  resetCredits: { available: 1, applicable: 0 },
  quotaGroups: [{
    id: 'openai-base', label: 'Codex', modelIds: [],
    windows: [{
      id: 'secondary', label: 'Weekly', kind: 'weekly',
      ...(remainingPercent === undefined ? {} : { remainingPercent }),
      usageKnown: remainingPercent !== undefined, source: 'provider'
    }]
  }]
})

describe('resetCreditGate', () => {
  it('admits a credit when the week is nearly spent', () => {
    expect(resetCreditGate(weekly(4.9))).toEqual({ allowed: true })
  })

  it('refuses when no credit is held', () => {
    expect(resetCreditGate(usage({ resetCredits: { available: 0, applicable: 0 } })).allowed).toBe(false)
  })

  it('refuses at exactly five percent', () => {
    // Strictly under. One step too cautious costs nothing; one step too loose
    // costs a credit that cannot be recovered.
    expect(resetCreditGate(weekly(5)).allowed).toBe(false)
  })

  it('refuses while most of the week remains', () => {
    expect(resetCreditGate(weekly(69)).allowed).toBe(false)
  })

  it('refuses when the weekly figure is unknown', () => {
    // A gate that cannot be evaluated has not been satisfied.
    expect(resetCreditGate(weekly(undefined)).allowed).toBe(false)
  })

  it('refuses when there is no weekly window at all', () => {
    expect(resetCreditGate(usage({ resetCredits: { available: 1, applicable: 1 } })).allowed).toBe(false)
  })

  it('refuses when there is no usage', () => {
    expect(resetCreditGate(undefined).allowed).toBe(false)
  })
})
