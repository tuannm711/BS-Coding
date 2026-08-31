import { z } from 'zod'

const stage = z.enum(['projects', 'providers', 'agents', 'sessions', 'usage'])
const count = z.number().int().nonnegative()

export const MigrationReportSchema = z.object({
  backupPath: z.string().min(1),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  stages: z.array(z.object({ name: stage, status: z.enum(['COMPLETED', 'CHECKPOINTED']),
    imported: count, skipped: count, errors: count }).strict()),
  completedStages: z.array(stage),
  validated: z.boolean(),
  validationErrors: z.array(z.string())
}).strict()
