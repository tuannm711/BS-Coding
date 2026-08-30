export interface ToolAuditEvent {
  type: 'TOOL_STARTED' | 'TOOL_COMPLETED' | 'TOOL_FAILED'
  callId: string
  result?: unknown
  error?: { message: string }
}

export interface ToolIdempotencyStore {
  reserve(callId: string): Promise<
    | { status: 'RESERVED' }
    | { status: 'COMPLETED'; result: unknown }
    | { status: 'IN_PROGRESS' }
  >
  complete(callId: string, result: unknown): Promise<void>
  fail(callId: string, error: Error): Promise<void>
}

const memoryIdempotencyStore = (): ToolIdempotencyStore => {
  const state = new Map<string, { status: 'IN_PROGRESS' | 'COMPLETED'; result?: unknown }>()
  return {
    async reserve(id) {
      const existing = state.get(id)
      if (existing?.status === 'COMPLETED') return { status: 'COMPLETED', result: existing.result }
      if (existing) return { status: 'IN_PROGRESS' }
      state.set(id, { status: 'IN_PROGRESS' }); return { status: 'RESERVED' }
    },
    async complete(id, result) { state.set(id, { status: 'COMPLETED', result }) },
    async fail(id) { state.delete(id) }
  }
}

export class ToolExecutor {
  private readonly executions = new Map<string, Promise<unknown>>()

  constructor(
    private readonly audit: { record(event: ToolAuditEvent): Promise<void> },
    private readonly idempotency: ToolIdempotencyStore = memoryIdempotencyStore()
  ) {}

  execute<T>(call: { callId: string }, run: () => Promise<T>): Promise<T> {
    const existing = this.executions.get(call.callId)
    if (existing) return existing as Promise<T>
    const execution = (async () => {
      const reservation = await this.idempotency.reserve(call.callId)
      if (reservation.status === 'COMPLETED') return reservation.result as T
      if (reservation.status === 'IN_PROGRESS') throw new Error(`tool call ${call.callId} is in progress`)
      await this.audit.record({ type: 'TOOL_STARTED', callId: call.callId })
      try {
        const result = await run()
        await this.idempotency.complete(call.callId, result)
        await this.audit.record({ type: 'TOOL_COMPLETED', callId: call.callId,
          result: redactObject(result) })
        return result
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error))
        await this.idempotency.fail(call.callId, normalized)
        await this.audit.record({ type: 'TOOL_FAILED', callId: call.callId,
          error: { message: normalized.message } })
        throw normalized
      }
    })()
    this.executions.set(call.callId, execution)
    return execution
  }
}
import { redactObject } from '../../application/security/redaction-service'
