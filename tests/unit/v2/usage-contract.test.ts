import { expect, it } from 'vitest'
import { BudgetPolicySchema, UsageRecordSchema } from '../../../src/shared/v2/schemas/usage'

it('allows omitted limits and rejects invalid usage values', () => {
  expect(BudgetPolicySchema.parse({})).toEqual({})
  expect(BudgetPolicySchema.safeParse({ maxCostUsd: -1 }).success).toBe(false)
  expect(UsageRecordSchema.safeParse({ id: 'u1', projectId: 'p1', providerId: 'openai',
    accountId: 'a1', requests: 1, inputTokens: -1, outputTokens: 0,
    costUsd: 0, occurredAt: '2026-08-30T00:00:00.000Z' }).success).toBe(false)
})
