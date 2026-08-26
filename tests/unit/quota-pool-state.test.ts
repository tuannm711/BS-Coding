import { describe, expect, it } from 'vitest'
import { poolState } from '../../src/shared/quota-pool'
import type { ProviderQuotaGroup } from '../../src/shared/types'

const group = (id: string, remaining: Array<number | undefined>): ProviderQuotaGroup => ({
  id, label: id, modelIds: [],
  windows: remaining.map((remainingPercent, index) => ({
    id: `${id}-${index}`, label: 'w', kind: 'weekly' as const,
    ...(remainingPercent === undefined ? {} : { remainingPercent }),
    usageKnown: remainingPercent !== undefined, source: 'provider' as const
  }))
})

describe('poolState', () => {
  it('calls a pool exhausted when any known window is spent', () => {
    // The owner's claude-gpt pool: the weekly limit is at 0 while the 5-hour
    // window reads 100. The weekly cap blocks it regardless.
    expect(poolState(group('claude-gpt', [0, 100]), undefined)).toBe('quota-exhausted')
  })

  it('leaves a pool with quota alone', () => {
    expect(poolState(group('gemini', [93.74, 100]), undefined)).toBe('ok')
  })

  it('prefers a recorded refusal over the numbers', () => {
    const errors = { 'claude-gpt': { kind: 'capacity-exhausted' as const, message: 'x', updatedAt: 1 } }
    expect(poolState(group('claude-gpt', [50, 100]), errors)).toBe('capacity-exhausted')
  })

  it('says nothing when no window is known', () => {
    // Unknown is not empty. Claiming exhaustion here would be inventing a fact.
    expect(poolState(group('unknown', [undefined]), undefined)).toBe('ok')
  })

  it('ignores an unrelated pool error', () => {
    const errors = { 'gemini': { kind: 'quota-exhausted' as const, message: 'x', updatedAt: 1 } }
    expect(poolState(group('claude-gpt', [50, 100]), errors)).toBe('ok')
  })
})
