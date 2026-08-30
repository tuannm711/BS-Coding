import { z } from 'zod'

const id = z.string().min(1)
const count = z.number().int().nonnegative()
const amount = z.number().nonnegative().finite()
const timestamp = z.iso.datetime({ offset: true })

export const UsageRecordSchema = z.object({
  id, projectId: id, workSessionId: id.optional(), workflowRunId: id.optional(),
  taskRunId: id.optional(), agentRunId: id.optional(), providerId: id, accountId: id,
  modelId: id.optional(), requests: count, inputTokens: count, outputTokens: count,
  cacheReadTokens: count.optional(), cacheWriteTokens: count.optional(), costUsd: amount,
  occurredAt: timestamp
}).strict()

export const QuotaSnapshotSchema = z.object({ providerId: id, accountId: id,
  status: z.enum(['AVAILABLE', 'UNAVAILABLE']), remainingPercent: z.number().min(0).max(100).optional(),
  resetAt: timestamp.optional(), capturedAt: timestamp }).strict()

export const BudgetPolicySchema = z.object({ maxCostUsd: amount.positive().optional(),
  maxInputTokens: count.positive().optional(), maxRequests: count.positive().optional(),
  maxConcurrentAgents: count.positive().optional(), maxElapsedMs: count.positive().optional(),
  softWarningPercent: z.number().positive().max(100).optional() }).strict()

export const UsageTotalsSchema = z.object({ requests: count, inputTokens: count,
  outputTokens: count, cacheReadTokens: count, cacheWriteTokens: count, costUsd: amount }).strict()
