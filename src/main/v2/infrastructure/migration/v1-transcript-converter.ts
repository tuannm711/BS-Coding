import { z } from 'zod'
import type { CanonicalToolCall, CanonicalToolResult } from '../../../../shared/v2/contracts/events'

const epochMillis = z.number().nonnegative().max(8_640_000_000_000_000)
const ExecutionSchema = z.object({
  turnId: z.string().min(1),
  agentId: z.string().min(1),
  startedAt: epochMillis,
  completedAt: epochMillis.optional()
})
const MessageItemSchema = z.object({
  kind: z.literal('message'),
  message: z.object({
    id: z.string().min(1), role: z.enum(['user', 'assistant']), text: z.string(),
    turnId: z.string().min(1).optional(), createdAt: epochMillis,
    execution: ExecutionSchema.optional()
  })
})
const ToolItemSchema = z.object({
  kind: z.literal('tool'),
  tool: z.object({
    id: z.string().min(1), tool: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    permission: z.enum(['pending', 'allowed', 'denied']),
    turnId: z.string().min(1).optional(), execution: ExecutionSchema.optional(),
    output: z.string().optional(), error: z.string().optional()
  })
})

export type LegacyEventDraft =
  | { type: 'USER_MESSAGE' | 'ASSISTANT_MESSAGE'; timestamp: string; correlationId: string;
      payload: { text: string } }
  | { type: 'TOOL_CALL'; timestamp: string; correlationId: string; payload: CanonicalToolCall }
  | { type: 'TOOL_RESULT'; timestamp: string; correlationId: string; payload: CanonicalToolResult }

function timestamp(value: number): string {
  return new Date(value).toISOString()
}

export function convertLegacyItem(value: unknown, fallbackTimestamp: string): LegacyEventDraft[] {
  const message = MessageItemSchema.safeParse(value)
  if (message.success) {
    const item = message.data.message
    return [{
      type: item.role === 'user' ? 'USER_MESSAGE' : 'ASSISTANT_MESSAGE',
      timestamp: timestamp(item.createdAt), correlationId: item.turnId ?? item.id,
      payload: { text: item.text }
    }]
  }

  const item = ToolItemSchema.parse(value).tool
  const requestedAt = item.execution ? timestamp(item.execution.startedAt) : fallbackTimestamp
  const completedAt = item.execution?.completedAt === undefined
    ? fallbackTimestamp
    : timestamp(item.execution.completedAt)
  const correlationId = item.turnId ?? item.execution?.turnId ?? item.id
  const result: CanonicalToolResult = item.permission === 'denied'
    ? { callId: item.id, status: 'denied', completedAt }
    : item.error !== undefined
      ? { callId: item.id, status: 'error',
          error: { code: 'LEGACY_TOOL_ERROR', message: item.error }, completedAt }
      : item.output !== undefined
        ? { callId: item.id, status: 'success', preview: item.output, completedAt }
        : { callId: item.id, status: 'cancelled', completedAt }
  return [
    {
      type: 'TOOL_CALL', timestamp: requestedAt, correlationId,
      payload: {
        callId: item.id, toolName: item.tool, arguments: item.input,
        origin: 'model', requestedAt
      }
    },
    { type: 'TOOL_RESULT', timestamp: completedAt, correlationId, payload: result }
  ]
}
