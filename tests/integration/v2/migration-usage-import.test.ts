import { describe, expect, it } from 'vitest'
import { UsageLedger } from '../../../src/main/v2/application/observability/usage-ledger'
import { importProjects } from '../../../src/main/v2/infrastructure/migration/import-projects'
import { importSessions } from '../../../src/main/v2/infrastructure/migration/import-sessions'
import { importHistoricalUsage } from '../../../src/main/v2/infrastructure/migration/import-usage'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRepositories } from '../../../src/main/v2/infrastructure/persistence/repositories'
import { SqliteEventStore } from '../../../src/main/v2/infrastructure/persistence/sqlite-event-store'
import { createUsageRepository } from '../../../src/main/v2/infrastructure/persistence/usage-repository'

const occurredAt = '2023-11-14T22:13:22.000Z'

describe('V1 historical usage import', () => {
  it('imports attributable turn usage and quota metadata without fabricating aggregate identity', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      const events = new SqliteEventStore(db)
      await importProjects(
        [{ legacyId: 'C:/PMS', path: 'C:/PMS', name: 'PMS' }], repositories,
        () => '2023-11-14T22:13:20.000Z'
      )
      const session = {
        id: 'session-usage', agentId: 'agent-1', projectPath: 'C:/PMS', title: 'Usage',
        createdAt: 1_700_000_000_000, updatedAt: 1_700_000_002_000,
        usage: { input: 31, output: 5, cacheRead: 4, cacheWrite: 1, cost: 1.25 },
        items: [{ kind: 'message', message: {
          id: 'assistant-1', role: 'assistant', text: 'Done', createdAt: 1_700_000_002_000,
          tokens: { input: 30, output: 5, total: 35, cacheRead: 4, cacheWrite: 1 },
          execution: {
            turnId: 'turn-1', agentId: 'agent-1', agentName: 'Worker', providerId: 'openai',
            accountId: 'account-1', modelId: 'gpt-5', speed: 'standard',
            startedAt: 1_700_000_000_000, completedAt: 1_700_000_002_000, status: 'completed'
          }
        } }]
      }
      await importSessions([session], { repositories, events })
      const dependencies = { repositories, usage: new UsageLedger(createUsageRepository(db)) }
      const providers = [{
        id: 'account-1', providerId: 'openai', usage: {
          accountId: 'account-1', status: 'ok', source: 'provider', refreshedAt: 1_700_000_002_000,
          primaryUsedPercent: 25, resetAt: 1_700_003_600_000,
          providerNativeMetadata: 'discard-me'
        }
      }]

      const first = await importHistoricalUsage({ sessions: [session], providerAccounts: providers },
        dependencies)
      db.prepare("DELETE FROM import_history WHERE source_type = 'v1:quota'").run()
      const second = await importHistoricalUsage({ sessions: [session], providerAccounts: providers },
        dependencies)
      const usageRow = db.prepare('SELECT payload_json FROM usage_records').get() as {
        payload_json: string
      }
      const usage = JSON.parse(usageRow.payload_json)
      const quotaRow = db.prepare('SELECT payload_json FROM historical_quota_snapshots').get() as {
        payload_json: string
      }
      const quota = JSON.parse(quotaRow.payload_json)

      expect(first).toEqual({
        importedUsage: 1, importedQuota: 1, skipped: 0, unattributed: 2
      })
      expect(second).toEqual({
        importedUsage: 0, importedQuota: 0, skipped: 2, unattributed: 2
      })
      expect(usage).toMatchObject({
        providerId: 'openai', accountId: 'account-1', modelId: 'gpt-5', requests: 1,
        inputTokens: 30, outputTokens: 5, cacheReadTokens: 4, cacheWriteTokens: 1,
        occurredAt, source: 'v1-session', confidence: 'ATTRIBUTED'
      })
      expect(usage).not.toHaveProperty('costUsd')
      expect(quota).toEqual({
        id: expect.any(String), providerId: 'openai', accountId: 'account-1',
        status: 'AVAILABLE', remainingPercent: 75,
        resetAt: '2023-11-14T23:13:20.000Z', capturedAt: occurredAt,
        source: 'v1-provider', confidence: 'EXACT'
      })
      expect(JSON.stringify(quota)).not.toContain('providerNativeMetadata')
      expect(JSON.stringify(db.prepare('SELECT * FROM usage_records').all()))
        .not.toContain('legacy-unknown')
      expect(db.prepare("SELECT COUNT(*) AS count FROM import_history WHERE source_type = 'v1:quota'")
        .get()).toEqual({ count: 1 })
    } finally {
      db.close()
    }
  })
})
