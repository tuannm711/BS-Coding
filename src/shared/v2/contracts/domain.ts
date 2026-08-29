import type { EntityId, IsoDateTime } from './common'

export type WorkSessionStatus =
  | 'PLANNING'
  | 'EXECUTING'
  | 'PAUSED'
  | 'REVIEW'
  | 'REWORK'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED'
  | 'BLOCKED'

export type WorkflowRunStatus =
  | 'RECEIVED'
  | 'ANALYZING'
  | 'PLANNING'
  | 'WAITING_APPROVAL'
  | 'EXECUTING'
  | 'INTEGRATING'
  | 'REVIEWING'
  | 'REWORKING'
  | 'VERIFYING'
  | 'PAUSED'
  | 'BLOCKED'
  | 'FAILED'
  | 'CANCELLED'
  | 'COMPLETED'

export type WorkflowResumableStatus = Exclude<
  WorkflowRunStatus,
  'PAUSED' | 'BLOCKED' | 'FAILED' | 'CANCELLED' | 'COMPLETED'
>

export type TaskRunStatus =
  | 'QUEUED'
  | 'READY'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'BLOCKED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REVIEW_FAILED'
  | 'REWORK'
  | 'COMPLETED'

export type AgentRunStatus =
  | 'CREATED'
  | 'STARTING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'BLOCKED'
  | 'CANCELLED'
  | 'DEGRADED'

export type RuntimeEpochStatus = 'STARTING' | 'ACTIVE' | 'CLOSING' | 'CLOSED'

export interface ExecutionCorrelation {
  projectId: EntityId
  workSessionId: EntityId
  workflowRunId: EntityId
  taskRunId?: EntityId
  agentRunId?: EntityId
  runtimeEpochId?: EntityId
}

export interface Project {
  id: EntityId
  name: string
  repoPath: string
  defaultBranch: string
  instructionsRef: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  archivedAt?: IsoDateTime
}

export interface WorkSession {
  id: EntityId
  projectId: EntityId
  title: string
  goal: string
  status: WorkSessionStatus
  activeWorkflowRunId?: EntityId
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  completedAt?: IsoDateTime
  cancelledAt?: IsoDateTime
}

export interface WorkflowRun {
  id: EntityId
  workSessionId: EntityId
  status: WorkflowRunStatus
  blockingGates: number
  planVersionId?: EntityId
  pausedFrom?: WorkflowResumableStatus
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  completedAt?: IsoDateTime
  cancelledAt?: IsoDateTime
}

export interface Task {
  id: EntityId
  workflowRunId: EntityId
  title: string
  dependsOn: EntityId[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface TaskRun {
  id: EntityId
  taskId: EntityId
  workflowRunId: EntityId
  attempt: number
  status: TaskRunStatus
  provenanceTaskRunId?: EntityId
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  completedAt?: IsoDateTime
}

export interface AgentDefinition {
  id: EntityId
  projectId: EntityId
  name: string
  role: string
  currentVersionId?: EntityId
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  archivedAt?: IsoDateTime
}

export interface AgentVersion {
  readonly id: EntityId
  readonly agentDefinitionId: EntityId
  readonly revision: number
  readonly systemInstructions: string
  readonly toolIds: readonly EntityId[]
  readonly skillIds: readonly EntityId[]
  readonly permissionProfile: Readonly<Record<string, string>>
  readonly createdAt: IsoDateTime
}

export interface AgentRun {
  id: EntityId
  taskRunId: EntityId
  agentVersionId: EntityId
  status: AgentRunStatus
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  completedAt?: IsoDateTime
}

export interface RuntimeEpoch {
  id: EntityId
  agentRunId: EntityId
  status: RuntimeEpochStatus
  reason: string
  runtimeTargetId?: EntityId
  startedAt: IsoDateTime
  endedAt?: IsoDateTime
}

export interface Review {
  id: EntityId
  workflowRunId: EntityId
  reviewerAgentVersionId: EntityId
  scope: string
  createdAt: IsoDateTime
}

export interface Finding {
  id: EntityId
  reviewId: EntityId
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: 'OPEN' | 'ACCEPTED' | 'FIXED' | 'DISMISSED'
  evidenceRefs: EntityId[]
  linkedReworkTaskId?: EntityId
  createdAt: IsoDateTime
}

export interface Artifact {
  id: EntityId
  projectId: EntityId
  kind: string
  uri: string
  createdAt: IsoDateTime
}
