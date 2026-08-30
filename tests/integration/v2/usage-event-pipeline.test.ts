import { expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { SqliteEventStore } from '../../../src/main/v2/infrastructure/persistence/sqlite-event-store'
import { SqliteUnitOfWork } from '../../../src/main/v2/infrastructure/persistence/sqlite-unit-of-work'
import { createUsageRepository } from '../../../src/main/v2/infrastructure/persistence/usage-repository'
import { UsageLedger } from '../../../src/main/v2/application/observability/usage-ledger'
import {
  createAgentRunUsageRecorder, createUsageEventService
} from '../../../src/main/v2/application/observability/usage-event-service'

it('atomically appends and projects canonical usage without replay double count', async () => {
  const db = openV2Database(':memory:')
  try {
    migrate(db)
    const events = new SqliteEventStore(db); const ledger = new UsageLedger(createUsageRepository(db))
    const unit = new SqliteUnitOfWork(db)
    const service = createUsageEventService({ events, ledger, transaction: operation => unit.run(operation) })
    const recorder = createAgentRunUsageRecorder({ service, nextId: () => 'usage-event-1',
      now: () => '2026-08-31T00:00:00.000Z' })
    const record = { projectId: 'p1', workSessionId: 'ws1', workflowRunId: 'wf1', taskRunId: 'tr1',
      agentRunId: 'ar1', correlationId: 'corr-1', providerId: 'openai', accountId: 'a1',
      modelId: 'm1', requests: 1 as const, inputTokens: 10, outputTokens: 2 }
    await recorder(record)
    await recorder(record)
    expect(await events.latestSequence('wf1')).toBe(1)
    await expect(ledger.totals({ workflowRunId: 'wf1' })).resolves.toMatchObject({
      requests: 1, inputTokens: 10, costUsd: 0, costKnown: false
    })
  } finally { db.close() }
})
