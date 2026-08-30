import type { RuntimeTarget } from '../../../../shared/v2/contracts/provider'
import type { CommandIdempotencyPort } from '../ports/command-idempotency-port'
import { runIdempotentCommand } from './idempotent-command'
import { ProjectionNotFoundError } from '../projections/project-projections'

interface ResolvedWork { workSessionId: string; workflowRunId: string; agentRunId?: string }

export function createWorkSessionCommands(deps: {
  idempotency: CommandIdempotencyPort
  transaction<T>(operation: () => Promise<T>): Promise<T>
  resolve(projectId: string, workSessionId: string): Promise<ResolvedWork | null>
  lifecycle: {
    pause(workflowRunId: string): Promise<unknown>
    resume(workflowRunId: string): Promise<unknown>
    cancel(workflowRunId: string): Promise<unknown>
  }
  switchRuntime(input: { workSessionId: string; agentRunId: string; target: RuntimeTarget; reason: string }): Promise<unknown>
  approvePlan(input: { workflowRunId: string; approved: true }): Promise<unknown>
  createRework(input: { workflowRunId: string; findingIds: readonly string[]; title: string }): Promise<unknown>
}) {
  const resolve = async (projectId: string, workSessionId: string) => {
    const work = await deps.resolve(projectId, workSessionId)
    if (!work) throw new ProjectionNotFoundError()
    return work
  }
  const run = async <T>(input: { requestId: string; projectId: string; workSessionId: string },
    name: string, operation: (work: ResolvedWork) => Promise<T>) => {
    const work = await resolve(input.projectId, input.workSessionId)
    return runIdempotentCommand(deps, input.requestId, name, () => operation(work))
  }
  return {
    pause: (input: { requestId: string; projectId: string; workSessionId: string }) =>
      run(input, 'workSession.pause', work => deps.lifecycle.pause(work.workflowRunId)),
    resume: (input: { requestId: string; projectId: string; workSessionId: string }) =>
      run(input, 'workSession.resume', work => deps.lifecycle.resume(work.workflowRunId)),
    cancel: (input: { requestId: string; projectId: string; workSessionId: string }) =>
      run(input, 'workSession.cancel', work => deps.lifecycle.cancel(work.workflowRunId)),
    switchRuntime: (input: { requestId: string; projectId: string; workSessionId: string;
      target: RuntimeTarget; reason: string }) => run(input, 'workSession.switchRuntime', work => {
      if (!work.agentRunId) throw new Error('active AgentRun is required')
      return deps.switchRuntime({ workSessionId: work.workSessionId, agentRunId: work.agentRunId,
        target: input.target, reason: input.reason })
    }),
    approvePlan: (input: { requestId: string; projectId: string; workSessionId: string }) =>
      run(input, 'workflow.approvePlan', work =>
        deps.approvePlan({ workflowRunId: work.workflowRunId, approved: true })),
    createRework: (input: { requestId: string; projectId: string; workSessionId: string;
      findingIds: readonly string[]; title: string }) => run(input, 'workflow.createRework', work =>
      deps.createRework({ workflowRunId: work.workflowRunId,
        findingIds: input.findingIds, title: input.title }))
  }
}
