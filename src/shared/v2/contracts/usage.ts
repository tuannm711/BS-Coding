export interface UsageRecord {
  id: string
  projectId: string
  workSessionId?: string
  workflowRunId?: string
  taskRunId?: string
  agentRunId?: string
  providerId: string
  accountId: string
  modelId?: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  costUsd: number
  occurredAt: string
}

export interface QuotaSnapshot {
  providerId: string
  accountId: string
  status: 'AVAILABLE' | 'UNAVAILABLE'
  remainingPercent?: number
  resetAt?: string
  capturedAt: string
}

export interface BudgetPolicy {
  maxCostUsd?: number
  maxInputTokens?: number
  maxRequests?: number
  maxConcurrentAgents?: number
  maxElapsedMs?: number
  softWarningPercent?: number
}

export interface BudgetUsage {
  costUsd: number
  inputTokens: number
  requests: number
  concurrentAgents: number
  elapsedMs: number
}

export type BudgetMetric = 'costUsd' | 'inputTokens' | 'requests' | 'concurrentAgents' | 'elapsedMs'
export type BudgetDecision = { decision: 'OK' } | {
  decision: 'SOFT_WARNING' | 'HARD_BLOCK'
  metric: BudgetMetric
  current: number
  limit: number
}

export interface UsageTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
}
