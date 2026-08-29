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
      envelope: TaskEnvelope }): Promise<Assignment> {
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
