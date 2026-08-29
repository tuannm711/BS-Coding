import { transitionWorkflow, type WorkflowState } from '../../domain/workflow/workflow-state'

export interface WorkflowLifecycleRecord extends WorkflowState {
  id: string
  completedOutputIds?: readonly string[]
}

export function createWorkflowLifecycleService(deps: {
  load(runId: string): Promise<WorkflowLifecycleRecord | null>
  save(run: WorkflowLifecycleRecord): Promise<void>
  cancelActiveAgentRuns(reason: string): Promise<void>
}) {
  const load = async (runId: string): Promise<WorkflowLifecycleRecord> => {
    const run = await deps.load(runId)
    if (!run) throw new Error(`unknown workflow run ${runId}`)
    return run
  }
  const transition = async (runId: string, event: Parameters<typeof transitionWorkflow>[1]) => {
    const run = await load(runId)
    const next = { ...run, ...transitionWorkflow(run, event) }
    await deps.save(next)
    return next
  }
  return {
    async pause(runId: string) {
      const next = await transition(runId, { type: 'PAUSE' })
      await deps.cancelActiveAgentRuns('pause')
      return next
    },
    resume: (runId: string) => transition(runId, { type: 'RESUME' }),
    async cancel(runId: string) {
      const next = await transition(runId, { type: 'CANCEL' })
      await deps.cancelActiveAgentRuns('cancel')
      return next
    },
    recoverInterrupted: (runId: string) => transition(runId, { type: 'BLOCK' })
  }
}
