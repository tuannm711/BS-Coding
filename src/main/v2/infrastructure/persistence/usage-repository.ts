import type BetterSqlite3 from 'better-sqlite3'
import type {
  UsageRepositoryPort, UsageScope
} from '../../application/observability/usage-ledger'
import type { UsageRecord, UsageTotals } from '../../../../shared/v2/contracts/usage'
import { UsageRecordSchema } from '../../../../shared/v2/schemas/usage'

const columns: Record<keyof UsageScope, string> = {
  projectId: 'project_id', workSessionId: 'work_session_id', workflowRunId: 'workflow_run_id',
  taskRunId: 'task_run_id', agentRunId: 'agent_run_id', providerId: 'provider_id', accountId: 'account_id'
}

export function createUsageRepository(db: BetterSqlite3.Database): UsageRepositoryPort {
  return {
    async insert(input) {
      const record: UsageRecord = UsageRecordSchema.parse(input)
      const result = db.prepare(`INSERT OR IGNORE INTO usage_records(
        id, project_id, work_session_id, workflow_run_id, task_run_id, agent_run_id,
        provider_id, account_id, requests, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, cost_usd, occurred_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(record.id, record.projectId, record.workSessionId ?? null, record.workflowRunId ?? null,
          record.taskRunId ?? null, record.agentRunId ?? null, record.providerId, record.accountId,
          record.requests, record.inputTokens, record.outputTokens, record.cacheReadTokens ?? 0,
          record.cacheWriteTokens ?? 0, record.costUsd, record.occurredAt, JSON.stringify(record))
      return result.changes === 1
    },
    async totals(scope) {
      const filters = Object.entries(scope).filter((entry): entry is [keyof UsageScope, string] =>
        typeof entry[1] === 'string' && entry[1].length > 0)
      const where = filters.length ? `WHERE ${filters.map(([key]) => `${columns[key]} = ?`).join(' AND ')}` : ''
      const row = db.prepare(`SELECT COALESCE(SUM(requests), 0) requests,
        COALESCE(SUM(input_tokens), 0) inputTokens, COALESCE(SUM(output_tokens), 0) outputTokens,
        COALESCE(SUM(cache_read_tokens), 0) cacheReadTokens,
        COALESCE(SUM(cache_write_tokens), 0) cacheWriteTokens,
        COALESCE(SUM(cost_usd), 0) costUsd FROM usage_records ${where}`)
        .get(...filters.map(([, value]) => value)) as UsageTotals
      return row
    }
  }
}
