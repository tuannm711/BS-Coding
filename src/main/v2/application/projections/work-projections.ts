import type { StoredEvent } from '../ports/event-store'
import type { ProjectionReadPort } from '../ports/projection-read-port'
import type {
  ConversationItemSummary, ExecutionNodeSummary, ReviewProjectionSummary,
  TaskProjectionSummary, WorkProjection
} from '../../../../shared/v2/contracts/ui-projections'
import { ProjectionNotFoundError } from './project-projections'
import { sectionFromList } from './optional-section'
import type { TaskRunStatus } from '../../../../shared/v2/contracts/domain'

export function projectedTaskStatus(status: TaskRunStatus | undefined): TaskProjectionSummary['status'] {
  if (!status) return 'QUEUED'
  if (status === 'WAITING_APPROVAL') return 'BLOCKED'
  if (status === 'REVIEW_FAILED') return 'FAILED'
  if (status === 'REWORK') return 'READY'
  return status
}

function conversationItem(event: StoredEvent): ConversationItemSummary {
  const data = event.payload as Record<string, unknown>
  const lifecycleRuntime = event.type === 'LIFECYCLE' && data.kind === 'RUNTIME_CHANGED'
  const kind = lifecycleRuntime ? 'RUNTIME_CHANGED' : event.type === 'TOOL_CALL' || event.type === 'TOOL_RESULT'
    ? 'TOOL' : event.type === 'USER_MESSAGE' || event.type === 'ASSISTANT_MESSAGE' ? 'MESSAGE' : 'SYSTEM'
  return { id: event.id, kind, occurredAt: event.timestamp,
    title: typeof data.title === 'string' ? data.title : event.type,
    ...(typeof data.text === 'string' ? { body: data.text } : {}),
    artifactRefs: Array.isArray(data.artifactRefs)
      ? data.artifactRefs.filter((value): value is string => typeof value === 'string') : [] }
}

export function createWorkProjectionService(deps: {
  reads: ProjectionReadPort
  loadEvents(workflowRunId: string): Promise<readonly StoredEvent[]>
  revision(workflowRunId: string): Promise<number>
}) {
  return {
    async getWorkProjection(projectId: string, workSessionId: string,
      workflowRunId: string): Promise<WorkProjection> {
      const [session, workflow] = await Promise.all([
        deps.reads.getWorkSessionOwnedByProject(projectId, workSessionId),
        deps.reads.getWorkflowOwnedByProject(projectId, workflowRunId)
      ])
      if (!session || !workflow || workflow.workSessionId !== session.id) throw new ProjectionNotFoundError()
      const [events, tasks, taskRuns, agentRuns, epochs, reviews, findings, artifacts, revision] =
        await Promise.all([deps.loadEvents(workflowRunId), deps.reads.listTasksByWorkflow(workflowRunId),
          deps.reads.listTaskRunsByWorkflow(workflowRunId), deps.reads.listAgentRunsByWorkflow(workflowRunId),
          deps.reads.listRuntimeEpochsByWorkflow(workflowRunId), deps.reads.listReviewsByWorkflow(workflowRunId),
          deps.reads.listFindingsByWorkflow(workflowRunId), deps.reads.listArtifactsByProject(projectId),
          deps.revision(workflowRunId)])
      const latestRun = new Map(taskRuns.map(run => [run.taskId, run]))
      const taskItems: TaskProjectionSummary[] = tasks.map(task => ({ id: task.id, title: task.title,
        status: projectedTaskStatus(latestRun.get(task.id)?.status),
        dependsOn: task.dependsOn }))
      const execution: ExecutionNodeSummary[] = agentRuns.map(run => ({ id: run.id,
        taskId: run.taskRunId, agentId: run.agentVersionId, status: run.status,
        ...(run.createdAt ? { startedAt: run.createdAt } : {}),
        ...(run.completedAt ? { completedAt: run.completedAt } : {}) }))
      const review: ReviewProjectionSummary = { reviews: reviews.map(item => ({ id: item.id,
        decision: item.decision, reviewerAgentVersionId: item.reviewerAgentVersionId })), gates: [],
        findings: findings.map(item => ({ id: item.id, severity: item.severity, status: item.status,
          blocking: item.blocking, description: item.description,
          ...(item.linkedReworkTaskId ? { linkedReworkTaskId: item.linkedReworkTaskId } : {}) })) }
      return { projectId, workSessionId, workflowRunId, revision,
        conversation: sectionFromList(events.map(conversationItem)), plan: { status: 'EMPTY' },
        tasks: sectionFromList(taskItems), execution: sectionFromList(execution),
        changes: sectionFromList(artifacts.map(item => ({ path: item.path, additions: 0, deletions: 0,
          artifactId: item.id }))), review: reviews.length || findings.length
          ? { status: 'AVAILABLE', value: review } : { status: 'EMPTY' },
        runtimeHistory: sectionFromList(epochs) }
    }
  }
}
