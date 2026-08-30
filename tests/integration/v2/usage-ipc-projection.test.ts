import { expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRepositories } from '../../../src/main/v2/infrastructure/persistence/repositories'
import { SqliteEventStore } from '../../../src/main/v2/infrastructure/persistence/sqlite-event-store'
import { SqliteUnitOfWork } from '../../../src/main/v2/infrastructure/persistence/sqlite-unit-of-work'
import {
  createBudgetPolicyRepository, createUsageRepository
} from '../../../src/main/v2/infrastructure/persistence/usage-repository'
import { UsageLedger } from '../../../src/main/v2/application/observability/usage-ledger'
import { createV2Services } from '../../../src/main/v2/application/create-v2-services'

it('serves scoped usage, persists explicit budget and rejects foreign ownership', async () => {
  const db = openV2Database(':memory:')
  try {
    migrate(db)
    const repositories = createRepositories(db); const events = new SqliteEventStore(db)
    const unit = new SqliteUnitOfWork(db); const usage = new UsageLedger(createUsageRepository(db))
    const budgets = createBudgetPolicyRepository(db)
    const createdAt = '2026-08-31T00:00:00.000Z'
    await repositories.projects.save({ id: 'p1', name: 'PMS', repoPath: 'C:/PMS', defaultBranch: 'main',
      instructionsRef: 'AGENTS.md', createdAt, updatedAt: createdAt })
    await repositories.workSessions.save({ id: 'ws1', projectId: 'p1', title: 'Work', goal: 'Work',
      status: 'EXECUTING', activeWorkflowRunId: 'wf1', createdAt, updatedAt: createdAt })
    await repositories.workflowRuns.save({ id: 'wf1', workSessionId: 'ws1', status: 'EXECUTING',
      blockingGates: 0, createdAt, updatedAt: createdAt })
    await usage.record({ id: 'u1', projectId: 'p1', workSessionId: 'ws1', workflowRunId: 'wf1',
      providerId: 'openai', accountId: 'a1', requests: 1, inputTokens: 10, outputTokens: 2,
      occurredAt: createdAt })
    const services = createV2Services({ repositories, events, usage, budgets,
      transaction: <T>(operation: () => Promise<T>) => unit.run(operation), support: {
        listQuotaSnapshots: async () => [{ providerId: 'openai', accountId: 'a1',
          status: 'AVAILABLE', remainingPercent: 75, capturedAt: createdAt }]
      } } as never)

    await services.handlers['usage.updateBudget']({ requestId: 'budget-1', input: {
      projectId: 'p1', workSessionId: 'ws1', workflowRunId: 'wf1', policy: { maxRequests: 2 } } })
    await expect(services.handlers['usage.get']({ projectId: 'p1', workSessionId: 'ws1',
      workflowRunId: 'wf1' })).resolves.toMatchObject({ totals: { requests: 1, costKnown: false },
      policy: { maxRequests: 2 }, decision: { decision: 'OK' } })
    await expect(services.handlers['provider.quota']({})).resolves.toMatchObject([{
      accountId: 'a1', remainingPercent: 75 }])
    await expect(services.handlers['usage.get']({ projectId: 'foreign', workSessionId: 'ws1',
      workflowRunId: 'wf1' })).rejects.toMatchObject({ code: 'PROJECTION_NOT_FOUND' })
  } finally { db.close() }
})
