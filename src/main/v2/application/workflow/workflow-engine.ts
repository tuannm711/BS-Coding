import type { SchedulableTask } from '../../../../shared/v2/contracts/workflow'
import { runnableTaskIds, validateGraph } from '../../domain/workflow/task-graph'
import type {
  AcceptTaskOutcomeCommand,
  ApprovedPlanCommand,
  WorkflowExecutionState
} from './workflow-commands'

const statusByOutcome: Record<AcceptTaskOutcomeCommand['outcome'], SchedulableTask['status']> = {
  SUCCEEDED: 'COMPLETED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  CANCELLED: 'CANCELLED',
  DEGRADED: 'FAILED'
}

export class WorkflowEngine {
  createFromApprovedPlan(command: ApprovedPlanCommand): WorkflowExecutionState {
    if (!command.approved) throw new Error('approved plan is required')
    validateGraph(command.tasks)
    return {
      workflowRunId: command.workflowRunId,
      tasks: command.tasks.map(task => ({
        id: task.id,
        status: 'QUEUED',
        dependsOn: [...task.dependsOn]
      }))
    }
  }

  dispatchReady(state: WorkflowExecutionState): SchedulableTask[] {
    const ids = new Set(runnableTaskIds(state.tasks))
    return state.tasks.filter(task => ids.has(task.id)).map(task => ({ ...task, dependsOn: [...task.dependsOn] }))
  }

  acceptTaskOutcome(
    state: WorkflowExecutionState,
    command: AcceptTaskOutcomeCommand
  ): WorkflowExecutionState {
    if (!state.tasks.some(task => task.id === command.taskId)) {
      throw new Error(`unknown task ${command.taskId}`)
    }
    return {
      ...state,
      tasks: state.tasks.map(task => task.id === command.taskId
        ? { ...task, status: statusByOutcome[command.outcome] }
        : task)
    }
  }
}
