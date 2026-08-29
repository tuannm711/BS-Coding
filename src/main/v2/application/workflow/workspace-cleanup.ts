export interface WorkspaceCleanupState {
  merged: boolean
  archived: boolean
  auditRecorded: boolean
  activeReferences: number
}

export function mayDeleteWorkspace(state: WorkspaceCleanupState): boolean {
  return (state.merged || state.archived) && state.auditRecorded && state.activeReferences === 0
}

export function createWorkspaceCleanupService(deps: {
  remove(workspaceId: string, options: { force: false }): Promise<void>
}) {
  return {
    async cleanup(workspaceId: string, state: WorkspaceCleanupState): Promise<
      | { kind: 'SKIPPED' }
      | { kind: 'REMOVED' }
      | { kind: 'WARNING'; message: string }
    > {
      if (!mayDeleteWorkspace(state)) return { kind: 'SKIPPED' }
      try {
        await deps.remove(workspaceId, { force: false })
        return { kind: 'REMOVED' }
      } catch (error) {
        return { kind: 'WARNING', message: error instanceof Error ? error.message : String(error) }
      }
    }
  }
}
