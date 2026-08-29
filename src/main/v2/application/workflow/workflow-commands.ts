import type { PlanTaskDefinition, SchedulableTask } from '../../../../shared/v2/contracts/workflow'

export interface ApprovedPlanCommand {
  workflowRunId: string
  approved: boolean
  tasks: readonly PlanTaskDefinition[]
}

export interface WorkflowExecutionState {
  workflowRunId: string
  tasks: readonly SchedulableTask[]
}

export interface AcceptTaskOutcomeCommand {
  taskId: string
  outcome: 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'CANCELLED' | 'DEGRADED'
}
