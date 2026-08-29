import { describe, expect, it } from 'vitest'
import { canDispatch } from '../../../src/main/v2/application/agent/admission-policy'

describe('agent dispatch admission', () => {
  it('does not invent concurrency or budget limits', () => {
    expect(canDispatch({ activeAgents: 999, spent: 999999 })).toEqual({ decision: 'ALLOW' })
  })

  it('blocks configured hard concurrency and budget limits', () => {
    expect(canDispatch({ maxConcurrentAgents: 2, activeAgents: 2, spent: 0 })).toEqual({
      decision: 'BLOCK', reason: 'CONCURRENCY_LIMIT'
    })
    expect(canDispatch({ hardBudget: 10, spent: 10, activeAgents: 0 })).toEqual({
      decision: 'BLOCK', reason: 'HARD_BUDGET'
    })
  })

  it('asks before projected spend crosses an explicit warning threshold', () => {
    expect(canDispatch({ warningBudget: 10, spent: 8, projectedCost: 3, activeAgents: 0 }))
      .toEqual({ decision: 'ASK', reason: 'PROJECTED_BUDGET', projectedSpend: 11 })
  })

  it('rejects invalid configured limits', () => {
    expect(() => canDispatch({ maxConcurrentAgents: 0, activeAgents: 0, spent: 0 }))
      .toThrow(/positive/i)
  })
})
