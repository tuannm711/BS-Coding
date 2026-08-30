import { expect, it } from 'vitest'
import { UsageLedger } from '../../../src/main/v2/application/observability/usage-ledger'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createUsageRepository } from '../../../src/main/v2/infrastructure/persistence/usage-repository'

const record = { id: 'usage-1', projectId: 'p1', workSessionId: 'ws1', workflowRunId: 'wf1',
  taskRunId: 'tr1', agentRunId: 'ar1', providerId: 'openai', accountId: 'account-1',
  modelId: 'model', requests: 1, inputTokens: 100, outputTokens: 20, cacheReadTokens: 10,
  costUsd: 0.25, occurredAt: '2026-08-30T00:00:00.000Z' }

it('persists usage idempotently and aggregates by correlation/provider scope', async () => {
  const db = openV2Database(':memory:')
  try {
    migrate(db)
    const ledger = new UsageLedger(createUsageRepository(db))
    expect(await ledger.record(record)).toBe(true)
    expect(await ledger.record(record)).toBe(false)
    await ledger.record({ ...record, id: 'usage-2', inputTokens: 50, costUsd: 0.1 })
    await ledger.record({ ...record, id: 'usage-foreign', projectId: 'p2', workSessionId: 'ws2',
      workflowRunId: 'wf2', providerId: 'google', accountId: 'account-2', costUsd: 9 })

    await expect(ledger.totals({ workflowRunId: 'wf1' })).resolves.toEqual({ requests: 2,
      inputTokens: 150, outputTokens: 40, cacheReadTokens: 20, cacheWriteTokens: 0,
      costUsd: 0.35, costKnown: true })
    await expect(ledger.totals({ providerId: 'openai', accountId: 'account-1' }))
      .resolves.toMatchObject({ requests: 2, costUsd: 0.35 })
  } finally { db.close() }
})
