import type { WorkSessionStatus } from './domain'
import type { FindingSeverity, FindingStatus, GateStatus, ReviewDecision } from './review'
import type { SkillSource } from './skills'

export type ProjectionSection<T> =
  | { status: 'AVAILABLE'; value: T }
  | { status: 'EMPTY' }
  | { status: 'UNAVAILABLE'; errorCode: string }

export interface ProjectSummary {
  id: string
  name: string
  repoPath: string
  defaultBranch: string
  activeWorkCount: number
  updatedAt: string
  revision: number
}

export interface WorkSessionSummary {
  id: string
  projectId: string
  title: string
  goal: string
  status: WorkSessionStatus
  completedTaskCount: number
  totalTaskCount: number
  activeAgentCount: number
  attentionCount: number
  updatedAt: string
  revision: number
}

export interface AttentionSummary {
  id: string
  projectId: string
  workSessionId: string
  kind: 'BLOCKED' | 'FAILED' | 'REVIEW'
  title: string
}

export interface HomeProjection {
  revision: number
  projects: readonly ProjectSummary[]
  activeWorkSessions: readonly WorkSessionSummary[]
  needsAttention: readonly AttentionSummary[]
  providerAccounts: ProjectionSection<readonly {
    id: string; providerId: string; enabled: boolean
    status: 'HEALTHY' | 'COOLDOWN' | 'EXPIRED' | 'ERROR' | 'UNKNOWN'
  }[]>
}

export interface WorkspaceSummary {
  id: string
  path: string
  mode: 'READ_ONLY' | 'ISOLATED_WRITE'
  fileCount: number
}

export interface GitSummary {
  branch: string
  dirty: boolean
  changedFiles: readonly string[]
}

export interface AgentSummary {
  id: string
  name: string
  role: string
  status: 'READY' | 'RUNNING' | 'DISABLED' | 'ERROR'
  currentVersionId?: string
}

export interface SkillBindingSummary {
  id: string
  name: string
  version: string
  source: SkillSource
  contentHash: string
  enabled: boolean
}

export interface McpServerSummary {
  id: string
  name: string
  status: 'CONNECTED' | 'ERROR'
  toolNames: readonly string[]
}

export interface ProjectDetailProjection {
  project: ProjectSummary
  revision: number
  workSessions: ProjectionSection<readonly WorkSessionSummary[]>
  workspace: ProjectionSection<WorkspaceSummary>
  git: ProjectionSection<GitSummary>
  agents: ProjectionSection<readonly AgentSummary[]>
  skills: ProjectionSection<readonly SkillBindingSummary[]>
  mcp: ProjectionSection<readonly McpServerSummary[]>
}

export interface ProjectWorkspaceProjection {
  projectId: string
  revision: number
  workspace: ProjectionSection<WorkspaceSummary>
  git: ProjectionSection<GitSummary>
}

export interface ConversationItemSummary {
  id: string
  kind: 'MESSAGE' | 'RUNTIME_CHANGED' | 'TOOL' | 'SYSTEM'
  occurredAt: string
  title: string
  body?: string
  artifactRefs: readonly string[]
}

export interface PlanProjectionSummary {
  id: string
  status: 'DRAFT' | 'WAITING_APPROVAL' | 'APPROVED'
  goal: string
  acceptanceCriteria: readonly string[]
}

export interface TaskProjectionSummary {
  id: string
  title: string
  status: 'QUEUED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'CANCELLED'
  dependsOn: readonly string[]
  assignedAgentId?: string
}

export interface ExecutionNodeSummary {
  id: string
  taskId: string
  agentId?: string
  status: string
  startedAt?: string
  completedAt?: string
}

export interface ChangeFileSummary {
  path: string
  additions: number
  deletions: number
  artifactId?: string
}

export interface ReviewProjectionSummary {
  reviews: readonly { id: string; decision: ReviewDecision; reviewerAgentVersionId: string }[]
  gates: readonly { id: string; status: GateStatus; blocking: boolean }[]
  findings: readonly {
    id: string; severity: FindingSeverity; status: FindingStatus; blocking: boolean
    description: string; linkedReworkTaskId?: string
  }[]
}

export interface RuntimeEpochSummary {
  id: string
  status: 'STARTING' | 'ACTIVE' | 'CLOSING' | 'CLOSED'
  providerId: string
  accountId: string
  modelId: string
  startedAt: string
  endedAt?: string
}

export interface WorkProjection {
  projectId: string
  workSessionId: string
  workflowRunId: string
  revision: number
  conversation: ProjectionSection<readonly ConversationItemSummary[]>
  plan: ProjectionSection<PlanProjectionSummary>
  tasks: ProjectionSection<readonly TaskProjectionSummary[]>
  execution: ProjectionSection<readonly ExecutionNodeSummary[]>
  changes: ProjectionSection<readonly ChangeFileSummary[]>
  review: ProjectionSection<ReviewProjectionSummary>
  runtimeHistory: ProjectionSection<readonly RuntimeEpochSummary[]>
}

export interface SafeSettingsSummary {
  providerCredentials: Readonly<Record<string, { configured: boolean }>>
}

export interface AgentSettingsProjection {
  projectId: string
  revision: number
  agents: readonly AgentSummary[]
  providerAccounts: readonly {
    id: string; providerId: string; enabled: boolean
    status: 'HEALTHY' | 'COOLDOWN' | 'EXPIRED' | 'ERROR' | 'UNKNOWN'
  }[]
  globalSettings: SafeSettingsSummary
}

export interface TerminalSummary {
  id: string
  title: string
  status: 'RUNNING' | 'EXITED' | 'ERROR'
}

export interface TestRunSummary {
  id: string
  status: 'PASS' | 'FAIL' | 'RUNNING'
  artifactId?: string
}

export interface ProblemSummary {
  id: string
  kind: 'LSP_DIAGNOSTIC' | 'REVIEW_FINDING'
  severity: 'INFO' | 'WARNING' | 'ERROR'
  message: string
  evidenceRefs: readonly string[]
}

export interface LogSummary {
  id: string
  occurredAt: string
  level: 'INFO' | 'WARNING' | 'ERROR'
  message: string
}

export interface OutputSummary {
  id: string
  preview: string
  artifactId?: string
}

export interface BottomPanelProjection {
  projectId: string
  workflowRunId: string
  revision: number
  terminals: ProjectionSection<readonly TerminalSummary[]>
  tests: ProjectionSection<readonly TestRunSummary[]>
  problems: ProjectionSection<readonly ProblemSummary[]>
  logs: ProjectionSection<readonly LogSummary[]>
  output: ProjectionSection<readonly OutputSummary[]>
}
