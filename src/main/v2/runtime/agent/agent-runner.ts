import type { RuntimeStreamPart } from '../../../../shared/v2/contracts/runtime'
import type { AgentRunExecutor, AgentRunnerInput, AgentRunOutcome } from '../../application/ports/agent-run-executor'

export class AgentRunner implements AgentRunExecutor {
  async run(input: AgentRunnerInput): Promise<AgentRunOutcome> {
    let toolResults: unknown[] = []
    for (let step = 0; step < input.maxSteps; step += 1) {
      if (input.signal?.aborted) return { status: 'CANCELLED', steps: step }
      try {
        const parts = await input.nextStep(step, toolResults, input.signal)
        const runtimeError = parts.find(part => part.kind === 'error')
        if (runtimeError?.kind === 'error') {
          return { status: 'FAILED', steps: step + 1, code: runtimeError.error.code,
            message: runtimeError.error.message }
        }
        const calls = parts.filter((part): part is Extract<RuntimeStreamPart, { kind: 'tool-call' }> =>
          part.kind === 'tool-call')
        toolResults = []
        for (const part of calls) {
          if (input.signal?.aborted) return { status: 'CANCELLED', steps: step + 1 }
          toolResults.push(await input.executeTool(part.call, input.signal))
        }
        if (calls.length === 0 && parts.some(part => part.kind === 'finish')) {
          return { status: 'SUCCEEDED', steps: step + 1 }
        }
      } catch (error) {
        if (input.signal?.aborted) return { status: 'CANCELLED', steps: step + 1 }
        const normalized = error instanceof Error ? error : new Error(String(error))
        return { status: 'FAILED', steps: step + 1, code: 'RUNTIME_ERROR',
          message: normalized.message }
      }
    }
    return { status: 'DEGRADED', steps: input.maxSteps, code: 'STEP_LIMIT' }
  }
}
