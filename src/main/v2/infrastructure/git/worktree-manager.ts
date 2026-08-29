import path from 'node:path'
import type { TaskWorkspace } from '../../../../shared/v2/contracts/workspace'
import { taskBranch } from '../../application/ports/workspace-port'
import { runGit } from './git-command'

export class WorktreeManager {
  private readonly workspaces = new Map<string, TaskWorkspace>()
  private readonly worktreeRoot: string

  constructor(private readonly repoPath: string) {
    const repoName = path.basename(repoPath).replace(/[^A-Za-z0-9._-]+/g, '-')
    this.worktreeRoot = path.join(path.dirname(repoPath), `.${repoName}-v2-worktrees`)
  }

  async createTaskWorkspace(input: { workflowId: string; taskId: string; taskRunId: string;
    attempt: number; baseCommit: string }): Promise<TaskWorkspace> {
    const branch = taskBranch(input.workflowId, input.taskId, input.attempt)
    const id = `${input.workflowId}-${input.taskId}-${input.attempt}`
      .replace(/[^A-Za-z0-9._-]+/g, '-')
    const workspacePath = path.join(this.worktreeRoot, id)
    await runGit(this.repoPath, ['worktree', 'add', '-b', branch, workspacePath, input.baseCommit])
    const workspace: TaskWorkspace = Object.freeze({
      id, path: workspacePath, branch, baseCommit: input.baseCommit,
      taskRunId: input.taskRunId, repoPath: this.repoPath
    })
    this.workspaces.set(id, workspace)
    return workspace
  }

  async status(workspaceId: string): Promise<TaskWorkspace | null> {
    return this.workspaces.get(workspaceId) ?? null
  }

  async remove(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) throw new Error(`unknown workspace ${workspaceId}`)
    if (await runGit(workspace.path, ['status', '--porcelain'])) {
      throw new Error('workspace has uncommitted or unmerged work')
    }
    const head = await runGit(workspace.path, ['rev-parse', 'HEAD'])
    if (head !== workspace.baseCommit) throw new Error('workspace has unmerged commits')
    await runGit(this.repoPath, ['worktree', 'remove', workspace.path])
    this.workspaces.delete(workspaceId)
  }
}
