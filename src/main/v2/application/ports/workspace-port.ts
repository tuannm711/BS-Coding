import type { TaskWorkspace, WorkspaceMergeOutcome } from '../../../../shared/v2/contracts/workspace'

function segment(value: string, label: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export function taskBranch(workflowId: string, taskId: string, attempt: number): string {
  if (!Number.isInteger(attempt) || attempt <= 0) throw new RangeError('attempt must be a positive integer')
  return `bs/v2/${segment(workflowId, 'workflowId')}/${segment(taskId, 'taskId')}/${attempt}`
}

export interface WorkspacePort {
  createTaskWorkspace(input: { workflowId: string; taskId: string; taskRunId: string;
    attempt: number; baseCommit: string }): Promise<TaskWorkspace>
  status(workspaceId: string): Promise<TaskWorkspace | null>
  merge(branch: string): Promise<WorkspaceMergeOutcome>
  remove(workspaceId: string): Promise<void>
}
