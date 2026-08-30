import { z } from 'zod'

const id = z.string().min(1)
export const DiagnosticCorrelationSchema = z.object({ projectId: id, workSessionId: id.optional(),
  workflowRunId: id.optional(), taskRunId: id.optional(), agentRunId: id.optional(),
  runtimeEpochId: id.optional(), correlationId: id }).strict()
export const DiagnosticEntrySchema = z.object({ id, timestamp: z.iso.datetime({ offset: true }),
  level: z.enum(['INFO', 'WARN', 'ERROR']), code: id, message: id,
  correlation: DiagnosticCorrelationSchema }).strict()
