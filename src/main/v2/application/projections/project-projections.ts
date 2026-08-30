import type { WorkSession } from '../../../../shared/v2/contracts/domain'
import type {
  AgentSummary, AttentionSummary, HomeProjection, ProjectDetailProjection, ProjectSummary,
  ProjectWorkspaceProjection, WorkSessionSummary
} from '../../../../shared/v2/contracts/ui-projections'
import type { ProjectionReadPort } from '../ports/projection-read-port'
import type { ProjectionSupportPort } from '../ports/projection-support-port'
import { sectionFromList, settleList, settleSection } from './optional-section'

const terminalStatuses = new Set(['COMPLETED', 'CANCELLED', 'FAILED'])

export class ProjectionNotFoundError extends Error {
  readonly code = 'PROJECTION_NOT_FOUND'
  constructor() {
    super('projection not found')
    this.name = 'ProjectionNotFoundError'
  }
}

export function createProjectProjectionService(deps: {
  reads: ProjectionReadPort
  support: ProjectionSupportPort
  revision(aggregateId: string): Promise<number>
}) {
  const summarizeSession = async (session: WorkSession): Promise<WorkSessionSummary> => {
    const workflowId = session.activeWorkflowRunId
    const [tasks, taskRuns, agentRuns] = workflowId
      ? await Promise.all([
          deps.reads.listTasksByWorkflow(workflowId),
          deps.reads.listTaskRunsByWorkflow(workflowId),
          deps.reads.listAgentRunsByWorkflow(workflowId)
        ])
      : [[], [], []]
    const completedTaskIds = new Set(taskRuns
      .filter(run => run.status === 'COMPLETED').map(run => run.taskId))
    const attentionCount = taskRuns.filter(run =>
      run.status === 'BLOCKED' || run.status === 'FAILED' || run.status === 'REVIEW_FAILED').length
    return Object.freeze({
      id: session.id, projectId: session.projectId, title: session.title, goal: session.goal,
      status: session.status, completedTaskCount: completedTaskIds.size, totalTaskCount: tasks.length,
      activeAgentCount: agentRuns.filter(run => run.status === 'RUNNING').length,
      attentionCount, updatedAt: session.updatedAt, revision: await deps.revision(session.id)
    })
  }

  const summarizeProject = async (project: Awaited<ReturnType<ProjectionReadPort['getProject']>> & {}) => {
    const sessions = await deps.reads.listWorkSessionsByProject(project.id)
    const activeWorkCount = sessions.filter(session => !terminalStatuses.has(session.status)).length
    return Object.freeze({
      id: project.id, name: project.name, repoPath: project.repoPath,
      defaultBranch: project.defaultBranch, activeWorkCount, updatedAt: project.updatedAt,
      revision: await deps.revision(project.id)
    }) satisfies ProjectSummary
  }

  return {
    async listHomeProjection(): Promise<HomeProjection> {
      const projects = [...await deps.reads.listProjects()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      const projectSummaries = await Promise.all(projects.map(summarizeProject))
      const sessions = (await Promise.all(projects.map(project =>
        deps.reads.listWorkSessionsByProject(project.id)))).flat()
      const active = sessions.filter(session => !terminalStatuses.has(session.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      const activeWorkSessions = await Promise.all(active.map(summarizeSession))
      const needsAttention: AttentionSummary[] = activeWorkSessions
        .filter(session => session.attentionCount > 0 || session.status === 'BLOCKED')
        .map(session => ({ id: `attention-${session.id}`, projectId: session.projectId,
          workSessionId: session.id, kind: session.status === 'BLOCKED' ? 'BLOCKED' : 'FAILED',
          title: session.title }))
      return Object.freeze({ revision: Math.max(0, ...projectSummaries.map(item => item.revision)),
        projects: Object.freeze(projectSummaries), activeWorkSessions: Object.freeze(activeWorkSessions),
        needsAttention: Object.freeze(needsAttention),
        providerAccounts: await settleList(deps.support.listProviderAccounts(), 'PROVIDERS_OFFLINE') })
    },

    async getProjectDetail(projectId: string): Promise<ProjectDetailProjection> {
      const project = await deps.reads.getProject(projectId)
      if (!project) throw new ProjectionNotFoundError()
      const revision = await deps.revision(projectId)
      const [summary, sessions, workspace, git, agents, skills, mcp] = await Promise.all([
        summarizeProject(project),
        settleList(deps.reads.listWorkSessionsByProject(projectId)
          .then(items => Promise.all(items.map(summarizeSession))), 'WORK_SESSIONS_UNAVAILABLE'),
        settleSection(deps.support.getWorkspace(projectId), 'WORKSPACE_OFFLINE'),
        settleSection(deps.support.getGitStatus(projectId), 'GIT_OFFLINE'),
        settleList(deps.reads.listAgentDefinitionsByProject(projectId).then(items => items.map(agent => ({
          id: agent.id, name: agent.name, role: agent.role,
          status: agent.archivedAt ? 'DISABLED' as const : 'READY' as const,
          ...(agent.currentVersionId ? { currentVersionId: agent.currentVersionId } : {})
        }) satisfies AgentSummary)), 'AGENTS_UNAVAILABLE'),
        settleSection(deps.support.listSkillBindings(projectId), 'SKILLS_OFFLINE'),
        settleSection(deps.support.listMcpServers(projectId), 'MCP_OFFLINE')
      ])
      return Object.freeze({ project: summary, revision, workSessions: sessions, workspace, git,
        agents, skills, mcp })
    },

    async getProjectWorkspace(projectId: string): Promise<ProjectWorkspaceProjection> {
      if (!await deps.reads.getProject(projectId)) throw new ProjectionNotFoundError()
      const [revision, workspace, git] = await Promise.all([
        deps.revision(projectId), settleSection(deps.support.getWorkspace(projectId), 'WORKSPACE_OFFLINE'),
        settleSection(deps.support.getGitStatus(projectId), 'GIT_OFFLINE')
      ])
      return Object.freeze({ projectId, revision, workspace, git })
    }
  }
}
