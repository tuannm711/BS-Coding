import type {
  BudgetDecision, BudgetMetric, BudgetPolicy, BudgetUsage
} from '../../../../shared/v2/contracts/usage'

export interface BudgetPolicyPort {
  get(scopeId: string): Promise<BudgetPolicy>
  save(scopeId: string, policy: BudgetPolicy, updatedAt: string): Promise<void>
}

const dimensions: Array<{ metric: BudgetMetric; limit: Exclude<keyof BudgetPolicy, 'softWarningPercent'> }> = [
  { metric: 'costUsd', limit: 'maxCostUsd' },
  { metric: 'inputTokens', limit: 'maxInputTokens' },
  { metric: 'requests', limit: 'maxRequests' },
  { metric: 'concurrentAgents', limit: 'maxConcurrentAgents' },
  { metric: 'elapsedMs', limit: 'maxElapsedMs' }
]

export function evaluateBudget(policy: BudgetPolicy, usage: BudgetUsage): BudgetDecision {
  for (const { metric, limit: limitKey } of dimensions) {
    const limit = policy[limitKey]
    if (limit == null) continue
    const current = usage[metric]
    if (metric === 'costUsd' && !usage.costKnown) {
      return { decision: 'SOFT_WARNING', metric, current, limit, unknown: true }
    }
    if (current >= limit) return { decision: 'HARD_BLOCK', metric, current, limit }
    if (policy.softWarningPercent != null && current >= limit * policy.softWarningPercent / 100) {
      return { decision: 'SOFT_WARNING', metric, current, limit }
    }
  }
  return { decision: 'OK' }
}
