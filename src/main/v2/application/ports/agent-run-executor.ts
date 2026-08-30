import type { CanonicalToolCall } from '../../../../shared/v2/contracts/events'
import type { RuntimeStreamPart } from '../../../../shared/v2/contracts/runtime'
import type { RuntimeUsage } from '../../../../shared/v2/contracts/runtime'

export type AgentRunOutcome =
  | { status: 'SUCCEEDED'; steps: number; usage?: RuntimeUsage }
  | { status: 'FAILED'; steps: number; code: string; message: string }
  | { status: 'CANCELLED'; steps: number }
  | { status: 'DEGRADED'; steps: number; code: 'STEP_LIMIT' }

export interface SteeringSource<T> {
  drain(): T[]
}

export interface AgentRunnerInput {
  maxSteps: number
  signal?: AbortSignal
  steering?: SteeringSource<string>
  nextStep(step: number, toolResults: readonly unknown[], signal?: AbortSignal,
    steering?: readonly string[]):
    Promise<readonly RuntimeStreamPart[]>
  executeTool(call: CanonicalToolCall, signal?: AbortSignal): Promise<unknown>
}

export interface AgentRunUsageContext {
  projectId: string
  workSessionId: string
  workflowRunId: string
  taskRunId: string
  providerId: string
  accountId: string
  modelId?: string
  runtimeEpochId?: string
  correlationId: string
}

export interface AgentRunUsageRecord extends AgentRunUsageContext, RuntimeUsage {
  agentRunId: string
  requests: 1
}

export interface AgentRunExecutor {
  run(input: AgentRunnerInput): Promise<AgentRunOutcome>
}
