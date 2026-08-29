import type { AgentRunStatus } from '../../../../shared/v2/contracts/domain'
import type { AgentRunExecutor, AgentRunnerInput, AgentRunOutcome } from '../ports/agent-run-executor'

export function createAgentRunService(deps: {
  saveStatus(agentRunId: string, status: AgentRunStatus): Promise<void>
  runner: AgentRunExecutor
}) {
  return {
    async runAssignment(input: AgentRunnerInput & { agentRunId: string }): Promise<AgentRunOutcome> {
      await deps.saveStatus(input.agentRunId, 'RUNNING')
      const outcome = await deps.runner.run(input)
      await deps.saveStatus(input.agentRunId, outcome.status)
      return outcome
    }
  }
}
