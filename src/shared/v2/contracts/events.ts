export type CanonicalEventType =
  | 'USER_MESSAGE' | 'ASSISTANT_MESSAGE' | 'TOOL_CALL' | 'TOOL_RESULT'
  | 'LIFECYCLE' | 'APPROVAL' | 'FINDING' | 'ARTIFACT' | 'USAGE' | 'ERROR'

export interface CanonicalEvent<T = unknown> {
  readonly id: string
  readonly type: CanonicalEventType
  readonly schemaVersion: 1
  readonly sequence: number
  readonly timestamp: string
  readonly projectId: string
  readonly workSessionId?: string
  readonly workflowRunId?: string
  readonly taskRunId?: string
  readonly agentRunId?: string
  readonly runtimeEpochId?: string
  readonly causationId?: string
  readonly correlationId: string
  readonly payload: T
}

export interface CanonicalToolCall {
  callId: string
  toolName: string
  arguments: unknown
  origin: 'model' | 'native-runtime'
  requestedAt: string
}

export interface CanonicalToolResult {
  callId: string
  status: 'success' | 'error' | 'denied' | 'cancelled'
  outputRef?: string
  preview?: string
  error?: { code: string; message: string }
  completedAt: string
}
