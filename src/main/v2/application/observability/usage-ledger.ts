import type { UsageRecord, UsageTotals } from '../../../../shared/v2/contracts/usage'

export interface UsageScope {
  projectId?: string
  workSessionId?: string
  workflowRunId?: string
  taskRunId?: string
  agentRunId?: string
  providerId?: string
  accountId?: string
}

export interface UsageRepositoryPort {
  insert(record: UsageRecord): Promise<boolean>
  totals(scope: UsageScope): Promise<UsageTotals>
}

export class UsageLedger {
  constructor(private readonly repository: UsageRepositoryPort) {}
  record(record: UsageRecord): Promise<boolean> { return this.repository.insert(record) }
  totals(scope: UsageScope): Promise<UsageTotals> { return this.repository.totals(scope) }
}
