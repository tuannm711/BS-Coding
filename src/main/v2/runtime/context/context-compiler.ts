import type { ContextArtifact, ContextPacket } from '../../../../shared/v2/contracts/context'
import type { CanonicalEvent } from '../../../../shared/v2/contracts/events'
import { selectContextEvents } from './context-policy'

export interface ContextCompilerDependencies {
  loadEvents(workSessionId: string): Promise<Array<CanonicalEvent & Record<string, unknown>>>
  loadSystem(input: { workSessionId: string; agentRunId: string }): Promise<string[]>
  loadArtifacts(input: { workSessionId: string; taskRunId: string }): Promise<ContextArtifact[]>
}

export interface CompileContextInput {
  workSessionId: string
  taskRunId: string
  agentRunId: string
  goal: string
  task?: string
  maxInputTokens: number
  toolSchemas?: Array<{ name: string; description: string }>
}

export class ContextCompiler {
  constructor(private readonly deps: ContextCompilerDependencies) {}

  async compileForAgentRun(input: CompileContextInput): Promise<ContextPacket> {
    const [events, system, artifacts] = await Promise.all([
      this.deps.loadEvents(input.workSessionId),
      this.deps.loadSystem({ workSessionId: input.workSessionId, agentRunId: input.agentRunId }),
      this.deps.loadArtifacts({ workSessionId: input.workSessionId, taskRunId: input.taskRunId })
    ])
    return {
      system: [...system], goal: input.goal, ...(input.task ? { task: input.task } : {}),
      history: selectContextEvents(events, { taskRunId: input.taskRunId, agentRunId: input.agentRunId }),
      artifacts: artifacts.map(artifact => ({ ...artifact })),
      toolSchemas: (input.toolSchemas ?? []).map(schema => ({ ...schema })),
      maxInputTokens: input.maxInputTokens
    }
  }
}
