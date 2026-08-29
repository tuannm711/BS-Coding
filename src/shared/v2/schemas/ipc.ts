import { z } from 'zod'

export const V2CommandEnvelopeSchema = z.object({
  requestId: z.string().min(1),
  input: z.unknown()
}).strict()

export const ProjectionEventSchema = z.object({
  sequence: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  payload: z.unknown()
}).strict()
