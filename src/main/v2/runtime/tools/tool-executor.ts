export interface ToolAuditEvent {
  type: 'TOOL_STARTED' | 'TOOL_COMPLETED' | 'TOOL_FAILED'
  callId: string
  result?: unknown
  error?: { message: string }
}

export class ToolExecutor {
  private readonly executions = new Map<string, Promise<unknown>>()

  constructor(private readonly audit: { record(event: ToolAuditEvent): Promise<void> }) {}

  execute<T>(call: { callId: string }, run: () => Promise<T>): Promise<T> {
    const existing = this.executions.get(call.callId)
    if (existing) return existing as Promise<T>
    const execution = (async () => {
      await this.audit.record({ type: 'TOOL_STARTED', callId: call.callId })
      try {
        const result = await run()
        await this.audit.record({ type: 'TOOL_COMPLETED', callId: call.callId, result })
        return result
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error))
        await this.audit.record({ type: 'TOOL_FAILED', callId: call.callId,
          error: { message: normalized.message } })
        throw normalized
      }
    })()
    this.executions.set(call.callId, execution)
    return execution
  }
}
