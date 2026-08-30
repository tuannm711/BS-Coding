import { describe, expect, it } from 'vitest'
import { canDispatch } from '../../../src/main/v2/application/agent/admission-policy'

describe('agent dispatch admission', () => {
  const usage = { costUsd: 999999, costKnown: true, inputTokens: 0, requests: 0, concurrentAgents: 999, elapsedMs: 0 }
  it('does not invent concurrency or budget limits', () => {
    expect(canDispatch({ policy: {}, usage })).toEqual({ decision: 'ALLOW' })
  })

  it('blocks configured hard concurrency and budget limits', () => {
    expect(canDispatch({ policy: { maxConcurrentAgents: 2 }, usage: { ...usage, concurrentAgents: 2 } })).toEqual({
      decision: 'BLOCK', reason: 'CONCURRENCY_LIMIT', metric: 'concurrentAgents', current: 2, limit: 2
    })
    expect(canDispatch({ policy: { maxCostUsd: 10 }, usage: { ...usage, costUsd: 10, concurrentAgents: 0 } })).toEqual({
      decision: 'BLOCK', reason: 'HARD_BUDGET', metric: 'costUsd', current: 10, limit: 10
    })
  })

  it('asks when explicit warning percentage is reached', () => {
    expect(canDispatch({ policy: { maxCostUsd: 10, softWarningPercent: 80 },
      usage: { ...usage, costUsd: 8, concurrentAgents: 0 } }))
      .toEqual({ decision: 'ASK', reason: 'PROJECTED_BUDGET', metric: 'costUsd', current: 8, limit: 10 })
  })
})
