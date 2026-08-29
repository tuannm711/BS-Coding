import type { TaskRunStatus } from '../../../../shared/v2/contracts/domain'

export interface TaskState {
  status: TaskRunStatus
}

export type TaskEvent =
  | { type: 'MARK_READY' }
  | { type: 'START' }
  | { type: 'COMPLETE' }
  | { type: 'WAIT_APPROVAL' }
  | { type: 'APPROVE' }
  | { type: 'BLOCK' }
  | { type: 'FAIL' }
  | { type: 'CANCEL' }
  | { type: 'REVIEW_FAIL' }
  | { type: 'START_REWORK' }

const transitions: Partial<Record<TaskRunStatus, Partial<Record<TaskEvent['type'], TaskRunStatus>>>> = {
  QUEUED: { MARK_READY: 'READY', BLOCK: 'BLOCKED', CANCEL: 'CANCELLED' },
  READY: { START: 'RUNNING', BLOCK: 'BLOCKED', CANCEL: 'CANCELLED' },
  RUNNING: {
    COMPLETE: 'COMPLETED',
    WAIT_APPROVAL: 'WAITING_APPROVAL',
    BLOCK: 'BLOCKED',
    FAIL: 'FAILED',
    CANCEL: 'CANCELLED',
    REVIEW_FAIL: 'REVIEW_FAILED'
  },
  WAITING_APPROVAL: { APPROVE: 'RUNNING', BLOCK: 'BLOCKED', CANCEL: 'CANCELLED' },
  REVIEW_FAILED: { START_REWORK: 'REWORK' }
}

const terminalStatuses = new Set<TaskRunStatus>(['COMPLETED', 'FAILED', 'CANCELLED', 'REWORK'])

export function transitionTask(run: TaskState, event: TaskEvent): TaskState {
  if (terminalStatuses.has(run.status)) {
    throw new Error(`terminal task ${run.status} cannot transition`)
  }

  const next = transitions[run.status]?.[event.type]
  if (!next) throw new Error(`illegal task transition: ${run.status} + ${event.type}`)
  return { ...run, status: next }
}
