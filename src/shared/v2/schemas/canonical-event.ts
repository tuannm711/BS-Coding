import { z } from 'zod'

const timestamp = z.iso.datetime({ offset: true })
const envelope = z.object({
  id: z.string().min(1), schemaVersion: z.literal(1), sequence: z.number().int().nonnegative(),
  timestamp, projectId: z.string().min(1), workSessionId: z.string().min(1).optional(),
  workflowRunId: z.string().min(1).optional(), taskRunId: z.string().min(1).optional(),
  agentRunId: z.string().min(1).optional(), runtimeEpochId: z.string().min(1).optional(),
  causationId: z.string().min(1).optional(), correlationId: z.string().min(1)
})
const message = z.object({ text: z.string() })
const toolCall = z.object({
  callId: z.string().min(1), toolName: z.string().min(1), arguments: z.unknown(),
  origin: z.enum(['model', 'native-runtime']), requestedAt: timestamp
})
const toolResult = z.object({
  callId: z.string().min(1), status: z.enum(['success', 'error', 'denied', 'cancelled']),
  outputRef: z.string().min(1).optional(), preview: z.string().optional(),
  error: z.object({ code: z.string().min(1), message: z.string() }).optional(), completedAt: timestamp
})
const variant = <T extends string>(type: T, payload: z.ZodType) => envelope.extend({
  type: z.literal(type), payload
})

export const CanonicalEventSchema = z.discriminatedUnion('type', [
  variant('USER_MESSAGE', message), variant('ASSISTANT_MESSAGE', message),
  variant('TOOL_CALL', toolCall), variant('TOOL_RESULT', toolResult),
  variant('LIFECYCLE', z.record(z.string(), z.unknown())),
  variant('APPROVAL', z.record(z.string(), z.unknown())),
  variant('FINDING', z.record(z.string(), z.unknown())),
  variant('ARTIFACT', z.record(z.string(), z.unknown())),
  variant('USAGE', z.record(z.string(), z.unknown())),
  variant('ERROR', z.object({ code: z.string().min(1), message: z.string() }))
])
