export type AdmissionDecision =
  | { decision: 'ALLOW' }
  | { decision: 'ASK'; reason: 'PROJECTED_BUDGET'; projectedSpend: number }
  | { decision: 'BLOCK'; reason: 'CONCURRENCY_LIMIT' | 'HARD_BUDGET' }

export function canDispatch(input: {
  maxConcurrentAgents?: number
  activeAgents: number
  hardBudget?: number
  warningBudget?: number
  spent: number
  projectedCost?: number
}): AdmissionDecision {
  if (input.maxConcurrentAgents != null &&
    (!Number.isInteger(input.maxConcurrentAgents) || input.maxConcurrentAgents <= 0)) {
    throw new RangeError('maxConcurrentAgents must be a positive integer')
  }
  if (input.maxConcurrentAgents != null && input.activeAgents >= input.maxConcurrentAgents) {
    return { decision: 'BLOCK', reason: 'CONCURRENCY_LIMIT' }
  }
  if (input.hardBudget != null && input.spent >= input.hardBudget) {
    return { decision: 'BLOCK', reason: 'HARD_BUDGET' }
  }
  const projectedSpend = input.spent + (input.projectedCost ?? 0)
  if (input.warningBudget != null && projectedSpend >= input.warningBudget) {
    return { decision: 'ASK', reason: 'PROJECTED_BUDGET', projectedSpend }
  }
  return { decision: 'ALLOW' }
}
