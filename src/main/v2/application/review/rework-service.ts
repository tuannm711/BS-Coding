import type { QualityGate, ReviewFinding, ReviewRecord } from '../../../../shared/v2/contracts/review'
import { canFinalize } from './final-verifier'

export interface ReworkTaskRecord {
  id: string
  workflowRunId: string
  title: string
  findingIds: readonly string[]
  createdAt: string
}

interface ReviewRerunResult {
  reviews: readonly ReviewRecord[]
  findings: readonly ReviewFinding[]
}

interface ReworkRequestDependencies {
  nextId(): string
  now(): string
  transaction<T>(operation: () => Promise<T>): Promise<T>
  saveReworkTask(task: ReworkTaskRecord): Promise<void>
  linkFinding(findingId: string, taskId: string): Promise<void>
}

function makeReworkTask(deps: Pick<ReworkRequestDependencies, 'nextId' | 'now'>, input: {
  workflowRunId: string; findingIds: readonly string[]; title: string
}): ReworkTaskRecord {
  if (input.findingIds.length === 0) throw new Error('rework requires at least one finding')
  return { id: deps.nextId(), workflowRunId: input.workflowRunId, title: input.title,
    findingIds: [...input.findingIds], createdAt: deps.now() }
}

export function createReworkRequestService(deps: ReworkRequestDependencies) {
  return { async request(input: { workflowRunId: string; findingIds: readonly string[]; title: string }) {
    const task = makeReworkTask(deps, input)
    await deps.transaction(async () => {
      await deps.saveReworkTask(task)
      for (const findingId of task.findingIds) await deps.linkFinding(findingId, task.id)
    })
    return { task, completed: false as const }
  } }
}

export function createReworkService(deps: {
  nextId(): string
  now(): string
  transaction<T>(operation: () => Promise<T>): Promise<T>
  saveReworkTask(task: ReworkTaskRecord): Promise<void>
  linkFinding(findingId: string, taskId: string): Promise<void>
  dispatchAndAwaitWorker(task: ReworkTaskRecord): Promise<void>
  rerunRequiredGates(task: ReworkTaskRecord): Promise<readonly QualityGate[]>
  rerunFailedReviews(task: ReworkTaskRecord): Promise<ReviewRerunResult>
  completeWorkflow(workflowRunId: string): Promise<void>
}) {
  return {
    async rework(input: { workflowRunId: string; findingIds: readonly string[]; title: string }) {
      const task = makeReworkTask(deps, input)
      await deps.transaction(async () => {
        await deps.saveReworkTask(task)
        for (const findingId of task.findingIds) await deps.linkFinding(findingId, task.id)
      })

      await deps.dispatchAndAwaitWorker(task)
      const gates = await deps.rerunRequiredGates(task)
      const reviewResult = await deps.rerunFailedReviews(task)
      const completed = canFinalize({
        gates,
        findings: reviewResult.findings,
        reviews: reviewResult.reviews
      })
      if (completed) await deps.completeWorkflow(input.workflowRunId)
      return { task, gates, ...reviewResult, completed }
    }
  }
}
