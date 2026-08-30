export interface TaskEnvelope {
  objective: string
  scope: readonly string[]
  acceptanceCriteria: readonly string[]
  dependencies: readonly string[]
  artifactIds: readonly string[]
  workspace: { path: string; mode: 'READ_ONLY' | 'ISOLATED_WRITE' }
  reportingContract: string
}

export interface Assignment {
  id: string
  taskRunId: string
  agentVersionId: string
  createdAt: string
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

interface AgentVersionRef {
  readonly id: string
  readonly revision: number
}

export class DispatchAdmissionError extends Error {
  constructor(readonly code: 'DISPATCH_BLOCKED' | 'DISPATCH_APPROVAL_REQUIRED',
    readonly metric: string, readonly current: number, readonly limit: number) {
    super(code === 'DISPATCH_BLOCKED' ? 'dispatch blocked by explicit budget' : 'dispatch requires budget approval')
    this.name = 'DispatchAdmissionError'
  }
}

export function createAssignmentService(deps: {
  nextId(): string
  now(): string
  loadAgentVersion(id: string): Promise<AgentVersionRef>
  save(assignment: Assignment): Promise<void>
  dispatch(input: { assignment: Assignment; agentVersion: AgentVersionRef;
    envelope: TaskEnvelope }): Promise<void>
}) {
  return {
    async assignAndDispatch(input: { taskRunId: string; agentVersionId: string;
      envelope: TaskEnvelope; budget: { policy: BudgetPolicy; usage: BudgetUsage } }): Promise<Assignment> {
      const admission = canDispatch(input.budget)
      if (admission.decision !== 'ALLOW') {
        throw new DispatchAdmissionError(admission.decision === 'BLOCK' ? 'DISPATCH_BLOCKED'
          : 'DISPATCH_APPROVAL_REQUIRED', admission.metric, admission.current, admission.limit)
      }
      const agentVersion = await deps.loadAgentVersion(input.agentVersionId)
      const assignment: Assignment = Object.freeze({
        id: deps.nextId(), taskRunId: input.taskRunId,
        agentVersionId: input.agentVersionId, createdAt: deps.now()
      })
      await deps.save(assignment)
      await deps.dispatch({ assignment, agentVersion,
        envelope: deepFreeze(structuredClone(input.envelope)) })
      return assignment
    }
  }
}
import type { BudgetPolicy, BudgetUsage } from '../../../../shared/v2/contracts/usage'
import { canDispatch } from './admission-policy'
