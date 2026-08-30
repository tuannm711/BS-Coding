import { expect, it } from 'vitest'
import { evaluateBudget } from '../../../src/main/v2/application/observability/budget-evaluator'
import { canDispatch } from '../../../src/main/v2/application/agent/admission-policy'

const usage = { costUsd: 9, inputTokens: 100, requests: 2, concurrentAgents: 1, elapsedMs: 1000 }

it('hard blocks only an explicitly configured exceeded dimension', () => {
  expect(evaluateBudget({}, { ...usage, costUsd: 999 })).toEqual({ decision: 'OK' })
  expect(evaluateBudget({ maxCostUsd: 10 }, usage)).toEqual({ decision: 'OK' })
  expect(evaluateBudget({ maxCostUsd: 9 }, usage)).toEqual({ decision: 'HARD_BLOCK',
    metric: 'costUsd', current: 9, limit: 9 })
})

it('warns at the configured percentage and integrates into admission', () => {
  expect(evaluateBudget({ maxInputTokens: 200, softWarningPercent: 50 }, usage))
    .toEqual({ decision: 'SOFT_WARNING', metric: 'inputTokens', current: 100, limit: 200 })
  expect(canDispatch({ policy: { maxRequests: 2 }, usage })).toEqual({ decision: 'BLOCK',
    reason: 'HARD_BUDGET', metric: 'requests', current: 2, limit: 2 })
})
