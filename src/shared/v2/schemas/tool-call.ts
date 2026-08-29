import { z } from 'zod'

const timestamp = z.iso.datetime({ offset: true })
export const CanonicalToolCallSchema = z.object({
  callId: z.string().min(1), toolName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  origin: z.enum(['model', 'native-runtime']), requestedAt: timestamp
})

export const CanonicalToolResultSchema = z.object({
  callId: z.string().min(1), status: z.enum(['success', 'error', 'denied', 'cancelled']),
  outputRef: z.string().min(1).optional(), preview: z.string().optional(),
  error: z.object({ code: z.string().min(1), message: z.string() }).optional(),
  completedAt: timestamp
})

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1), description: z.string().min(1), permissionCategory: z.string().min(1),
  sideEffectLevel: z.enum(['NONE', 'LOCAL_WRITE', 'EXTERNAL_WRITE', 'DESTRUCTIVE']),
  supportsCancellation: z.boolean(), outputPolicy: z.enum(['INLINE', 'TRUNCATE', 'ARTIFACT']),
  workspaceRequirement: z.enum(['NONE', 'PROJECT', 'ISOLATED_WRITE']).optional()
})
