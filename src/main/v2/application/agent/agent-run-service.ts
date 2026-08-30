import type { AgentRunStatus } from '../../../../shared/v2/contracts/domain'
import type { AgentRunExecutor, AgentRunnerInput, AgentRunOutcome, AgentRunUsageContext,
  AgentRunUsageRecord } from '../ports/agent-run-executor'

export function createAgentRunService(deps: {
  saveStatus(agentRunId: string, status: AgentRunStatus): Promise<void>
  runner: AgentRunExecutor
  recordUsage(record: AgentRunUsageRecord): Promise<void>
}) {
  return {
    async runAssignment(input: AgentRunnerInput & { agentRunId: string;
      usageContext: AgentRunUsageContext }): Promise<AgentRunOutcome> {
      await deps.saveStatus(input.agentRunId, 'RUNNING')
      const outcome = await deps.runner.run(input)
      if (outcome.status === 'SUCCEEDED' && outcome.usage) {
        await deps.recordUsage({ ...input.usageContext, agentRunId: input.agentRunId,
          requests: 1, ...outcome.usage })
      }
      await deps.saveStatus(input.agentRunId, outcome.status)
      return outcome
    }
  }
}
