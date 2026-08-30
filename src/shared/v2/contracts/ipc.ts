import type { WorkSession, WorkflowRun } from './domain'
import type { ProviderAccountSummary } from './provider'

export const V2_IPC_FAMILIES = [
  'project', 'workSession', 'workflow', 'task', 'agent', 'provider', 'workspace',
  'git', 'skill', 'mcp', 'settings', 'diagnostics', 'remote'
] as const

export type V2IpcFamily = typeof V2_IPC_FAMILIES[number]

export interface V2CommandEnvelope<T> {
  requestId: string
  input: T
}

export interface ProjectionEvent<T> {
  sequence: number
  revision: number
  payload: T
}

export interface WorkSessionCreateInput {
  projectId: string
  goal: string
  title?: string
}

export interface BsV2Api {
  readonly enabled: boolean
  workSession: {
    create(input: WorkSessionCreateInput): Promise<WorkSession>
    pause(id: string): Promise<WorkSession>
  }
  provider: {
    listAccounts(): Promise<readonly ProviderAccountSummary[]>
  }
  workflow: {
    get(id: string): Promise<WorkflowRun>
    subscribe(workflowRunId: string, callback: (event: ProjectionEvent<WorkflowRun>) => void): () => void
  }
}

export const V2_IPC = Object.freeze({
  project: { get: 'bs.v2.project.get', list: 'bs.v2.project.list' },
  workSession: { create: 'bs.v2.workSession.create', pause: 'bs.v2.workSession.pause' },
  workflow: { get: 'bs.v2.workflow.get', projection: 'bs.v2.workflow.projection' },
  task: { get: 'bs.v2.task.get', list: 'bs.v2.task.list' },
  agent: { get: 'bs.v2.agent.get', list: 'bs.v2.agent.list' },
  provider: { listAccounts: 'bs.v2.provider.listAccounts' },
  workspace: { get: 'bs.v2.workspace.get' },
  git: { status: 'bs.v2.git.status' },
  skill: { list: 'bs.v2.skill.list' },
  mcp: { listServers: 'bs.v2.mcp.listServers' },
  settings: { get: 'bs.v2.settings.get', update: 'bs.v2.settings.update' },
  diagnostics: { list: 'bs.v2.diagnostics.list' },
  remote: { status: 'bs.v2.remote.status' }
} as const)
