import { z } from 'zod'

export const UpdateSnapshotSchema = z.object({
  state: z.enum(['IDLE', 'CHECKING', 'AVAILABLE', 'DOWNLOADING', 'READY', 'ERROR']),
  channel: z.enum(['STABLE', 'BETA']),
  version: z.string().min(1).optional(),
  currentVersion: z.string().min(1).optional(),
  releaseNotes: z.string().optional(),
  releaseDate: z.iso.datetime({ offset: true }).optional(),
  progress: z.number().min(0).max(100).optional(),
  message: z.string().optional()
}).strict()
