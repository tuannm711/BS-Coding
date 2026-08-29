import type { WorkflowRunStatus, WorkSessionStatus } from '../../../../shared/v2/contracts/domain'

const workSessionStatusByWorkflow: Record<WorkflowRunStatus, WorkSessionStatus> = {
  RECEIVED: 'PLANNING',
  ANALYZING: 'PLANNING',
  PLANNING: 'PLANNING',
  WAITING_APPROVAL: 'PLANNING',
  EXECUTING: 'EXECUTING',
  INTEGRATING: 'EXECUTING',
  REVIEWING: 'REVIEW',
  REWORKING: 'REWORK',
  VERIFYING: 'VERIFYING',
  PAUSED: 'PAUSED',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED'
}

export function deriveWorkSessionStatus(
  activeWorkflow: { status: WorkflowRunStatus } | null
): WorkSessionStatus {
  return activeWorkflow ? workSessionStatusByWorkflow[activeWorkflow.status] : 'PLANNING'
}
