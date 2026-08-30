import type { BudgetMetric, BudgetPolicy, BudgetUsage } from '../../../../shared/v2/contracts/usage'
import { evaluateBudget } from '../observability/budget-evaluator'

export type AdmissionDecision =
  | { decision: 'ALLOW' }
  | { decision: 'ASK'; reason: 'PROJECTED_BUDGET'; metric: BudgetMetric; current: number; limit: number }
  | { decision: 'BLOCK'; reason: 'CONCURRENCY_LIMIT' | 'HARD_BUDGET'; metric: BudgetMetric;
    current: number; limit: number }

export function canDispatch(input: { policy: BudgetPolicy; usage: BudgetUsage }): AdmissionDecision {
  const result = evaluateBudget(input.policy, input.usage)
  if (result.decision === 'OK') return { decision: 'ALLOW' }
  if (result.decision === 'SOFT_WARNING') return { decision: 'ASK', reason: 'PROJECTED_BUDGET',
    metric: result.metric, current: result.current, limit: result.limit }
  return { decision: 'BLOCK',
    reason: result.metric === 'concurrentAgents' ? 'CONCURRENCY_LIMIT' : 'HARD_BUDGET',
    metric: result.metric, current: result.current, limit: result.limit }
}
