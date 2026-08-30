import type {
  GitSummary, ProjectionSection, WorkspaceSummary
} from '../../../../shared/v2/contracts/ui-projections'

interface LegacyWorkspaceGitEdge {
  resolveProjectPath(projectId: string): Promise<string | null>
  getWorkspace(projectPath: string): { projectPath: string } | null | undefined
  getGitStatus(projectPath: string): Promise<{ branch: string | null; dirtyCount: number } | null>
}

// Delete at P20 cutover when projects/workspaces and Git reads are V2-owned.
export class V1WorkspaceGitAdapter {
  constructor(private readonly legacy: LegacyWorkspaceGitEdge) {}

  async getWorkspace(projectId: string): Promise<ProjectionSection<WorkspaceSummary>> {
    const projectPath = await this.legacy.resolveProjectPath(projectId)
    if (!projectPath) return { status: 'EMPTY' }
    const workspace = this.legacy.getWorkspace(projectPath)
    if (!workspace) return { status: 'EMPTY' }
    return { status: 'AVAILABLE', value: { id: `workspace-${projectId}`, path: projectPath,
      mode: 'READ_ONLY', fileCount: 0 } }
  }

  async getGitStatus(projectId: string): Promise<ProjectionSection<GitSummary>> {
    const projectPath = await this.legacy.resolveProjectPath(projectId)
    if (!projectPath) return { status: 'EMPTY' }
    const status = await this.legacy.getGitStatus(projectPath)
    if (!status) return { status: 'UNAVAILABLE', errorCode: 'GIT_OFFLINE' }
    return { status: 'AVAILABLE', value: { branch: status.branch ?? 'DETACHED',
      dirty: status.dirtyCount > 0, changedFiles: [] } }
  }
}
