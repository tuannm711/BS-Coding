import type {
  AgentDefinition, AgentRun, Project, Task, TaskRun, WorkflowRun, WorkSession
} from '../../../../shared/v2/contracts/domain'
import type { ReviewFinding, ReviewRecord } from '../../../../shared/v2/contracts/review'
import type { RuntimeEpochSummary } from '../../../../shared/v2/contracts/ui-projections'
import type { ArtifactRef } from './artifact-store'

export interface ProjectionReadPort {
  getProject(id: string): Promise<Project | null>
  listProjects(): Promise<readonly Project[]>
  getWorkSessionOwnedByProject(projectId: string, workSessionId: string): Promise<WorkSession | null>
  listWorkSessionsByProject(projectId: string): Promise<readonly WorkSession[]>
  getWorkflowOwnedByProject(projectId: string, workflowRunId: string): Promise<WorkflowRun | null>
  listTasksByWorkflow(workflowRunId: string): Promise<readonly Task[]>
  listTaskRunsByWorkflow(workflowRunId: string): Promise<readonly TaskRun[]>
  listAgentDefinitionsByProject(projectId: string): Promise<readonly AgentDefinition[]>
  listAgentRunsByWorkflow(workflowRunId: string): Promise<readonly AgentRun[]>
  listRuntimeEpochsByWorkflow(workflowRunId: string): Promise<readonly RuntimeEpochSummary[]>
  listReviewsByWorkflow(workflowRunId: string): Promise<readonly ReviewRecord[]>
  listFindingsByWorkflow(workflowRunId: string): Promise<readonly ReviewFinding[]>
  listArtifactsByProject(projectId: string): Promise<readonly ArtifactRef[]>
}
