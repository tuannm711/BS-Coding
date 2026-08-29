export interface TaskWorkspace {
  id: string
  path: string
  branch: string
  baseCommit: string
  taskRunId: string
  repoPath: string
  headCommit?: string
  changesetId?: string
}

export type WorkspaceMergeOutcome =
  | { kind: 'MERGED'; commit: string }
  | { kind: 'CONFLICT'; files: string[] }
