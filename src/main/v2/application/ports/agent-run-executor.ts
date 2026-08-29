import type { CanonicalToolCall } from '../../../../shared/v2/contracts/events'
import type { RuntimeStreamPart } from '../../../../shared/v2/contracts/runtime'

export type AgentRunOutcome =
  | { status: 'SUCCEEDED'; steps: number }
  | { status: 'FAILED'; steps: number; code: string; message: string }
  | { status: 'CANCELLED'; steps: number }
  | { status: 'DEGRADED'; steps: number; code: 'STEP_LIMIT' }

export interface AgentRunnerInput {
  maxSteps: number
  signal?: AbortSignal
  nextStep(step: number, toolResults: readonly unknown[], signal?: AbortSignal):
    Promise<readonly RuntimeStreamPart[]>
  executeTool(call: CanonicalToolCall, signal?: AbortSignal): Promise<unknown>
}

export interface AgentRunExecutor {
  run(input: AgentRunnerInput): Promise<AgentRunOutcome>
}
