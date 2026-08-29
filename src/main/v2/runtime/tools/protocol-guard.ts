import type { z } from 'zod'
import type { CanonicalToolCall } from '../../../../shared/v2/contracts/events'
import type { ToolDefinition } from '../../../../shared/v2/contracts/tools'
import { CanonicalToolCallSchema } from '../../../../shared/v2/schemas/tool-call'

export interface RegisteredTool {
  definition: ToolDefinition
  argumentsSchema: z.ZodType<Record<string, unknown>>
}

export type ProtocolDecision =
  | { ok: true; call: CanonicalToolCall; tool: RegisteredTool }
  | { ok: false; code: 'PROTOCOL_VIOLATION' | 'UNKNOWN_TOOL' | 'INVALID_ARGS' |
      'DUPLICATE_CALL' | 'CAPABILITY_VIOLATION' }

export class ProtocolGuard {
  private readonly callIds = new Set<string>()

  constructor(
    private readonly registry: ReadonlyMap<string, RegisteredTool>,
    private readonly capabilities: { structuredTools: boolean } = { structuredTools: true }
  ) {}

  acceptAssistantText(_text: string): ProtocolDecision {
    return { ok: false, code: 'PROTOCOL_VIOLATION' }
  }

  validateToolCall(input: unknown): ProtocolDecision {
    if (!this.capabilities.structuredTools) return { ok: false, code: 'CAPABILITY_VIOLATION' }
    const call = CanonicalToolCallSchema.safeParse(input)
    if (!call.success) return { ok: false, code: 'INVALID_ARGS' }
    const tool = this.registry.get(call.data.toolName)
    if (!tool) return { ok: false, code: 'UNKNOWN_TOOL' }
    const args = tool.argumentsSchema.safeParse(call.data.arguments)
    if (!args.success) return { ok: false, code: 'INVALID_ARGS' }
    if (this.callIds.has(call.data.callId)) return { ok: false, code: 'DUPLICATE_CALL' }
    this.callIds.add(call.data.callId)
    return { ok: true, call: { ...call.data, arguments: args.data }, tool }
  }

  releaseCall(callId: string): void {
    this.callIds.delete(callId)
  }
}
