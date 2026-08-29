import type { WorkflowRunStatus } from '../../../../shared/v2/contracts/domain'

export interface WorkflowState {
  status: WorkflowRunStatus
  blockingGates: number
  pausedFrom?: Exclude<WorkflowRunStatus, 'PAUSED'>
}

export type WorkflowEvent =
  | { type: 'ANALYZE' }
  | { type: 'PLAN' }
  | { type: 'REQUEST_APPROVAL' }
  | { type: 'APPROVE' }
  | { type: 'INTEGRATE' }
  | { type: 'REVIEW' }
  | { type: 'REQUEST_REWORK' }
  | { type: 'VERIFY' }
  | { type: 'COMPLETE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'BLOCK' }
  | { type: 'FAIL' }
  | { type: 'CANCEL' }

const transitions: Partial<Record<WorkflowRunStatus, Partial<Record<WorkflowEvent['type'], WorkflowRunStatus>>>> = {
  RECEIVED: { ANALYZE: 'ANALYZING' },
  ANALYZING: { PLAN: 'PLANNING' },
  PLANNING: { REQUEST_APPROVAL: 'WAITING_APPROVAL' },
  WAITING_APPROVAL: { APPROVE: 'EXECUTING' },
  EXECUTING: { INTEGRATE: 'INTEGRATING' },
  INTEGRATING: { REVIEW: 'REVIEWING' },
  REVIEWING: { REQUEST_REWORK: 'REWORKING', VERIFY: 'VERIFYING' },
  REWORKING: { VERIFY: 'VERIFYING' },
  VERIFYING: { COMPLETE: 'COMPLETED' }
}

const terminalStatuses = new Set<WorkflowRunStatus>(['COMPLETED', 'CANCELLED'])

export function transitionWorkflow(run: WorkflowState, event: WorkflowEvent): WorkflowState {
  if (terminalStatuses.has(run.status)) {
    throw new Error(`terminal workflow ${run.status} cannot transition`)
  }

  if (event.type === 'COMPLETE' && run.blockingGates > 0) {
    throw new Error('blocking quality gates remain')
  }

  if (event.type === 'PAUSE' && run.status !== 'PAUSED' && run.status !== 'BLOCKED' && run.status !== 'FAILED') {
    return { ...run, status: 'PAUSED', pausedFrom: run.status }
  }

  if (event.type === 'RESUME' && run.status === 'PAUSED' && run.pausedFrom) {
    return { ...run, status: run.pausedFrom, pausedFrom: undefined }
  }

  if (event.type === 'BLOCK' && run.status !== 'PAUSED' && run.status !== 'BLOCKED') {
    return { ...run, status: 'BLOCKED' }
  }

  if (event.type === 'FAIL') return { ...run, status: 'FAILED' }
  if (event.type === 'CANCEL') return { ...run, status: 'CANCELLED' }

  const next = transitions[run.status]?.[event.type]
  if (!next) throw new Error(`illegal workflow transition: ${run.status} + ${event.type}`)
  return { ...run, status: next }
}
