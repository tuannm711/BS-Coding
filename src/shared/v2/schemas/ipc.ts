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

const id = z.string().min(1)
const timestamp = z.iso.datetime({ offset: true })

export const WorkSessionSchema = z.object({
  id,
  projectId: id,
  title: z.string(),
  goal: z.string(),
  status: z.enum(['PLANNING', 'EXECUTING', 'PAUSED', 'REVIEW', 'REWORK', 'VERIFYING',
    'COMPLETED', 'CANCELLED', 'FAILED', 'BLOCKED']),
  activeWorkflowRunId: id.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: timestamp.optional(),
  cancelledAt: timestamp.optional()
}).strict()

export const WorkflowRunSchema = z.object({
  id,
  workSessionId: id,
  status: z.enum(['RECEIVED', 'ANALYZING', 'PLANNING', 'WAITING_APPROVAL', 'EXECUTING',
    'INTEGRATING', 'REVIEWING', 'REWORKING', 'VERIFYING', 'PAUSED', 'BLOCKED', 'FAILED',
    'CANCELLED', 'COMPLETED']),
  blockingGates: z.number().int().nonnegative(),
  planVersionId: id.optional(),
  pausedFrom: z.enum(['RECEIVED', 'ANALYZING', 'PLANNING', 'WAITING_APPROVAL', 'EXECUTING',
    'INTEGRATING', 'REVIEWING', 'REWORKING', 'VERIFYING']).optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: timestamp.optional(),
  cancelledAt: timestamp.optional()
}).strict()

export const ProviderAccountSummarySchema = z.object({
  id,
  providerId: id,
  enabled: z.boolean(),
  status: z.enum(['HEALTHY', 'COOLDOWN', 'EXPIRED', 'ERROR', 'UNKNOWN'])
}).strict()

const WorkSessionCreateRequestSchema = z.object({
  requestId: id,
  input: z.object({ projectId: id, goal: z.string().min(1), title: z.string().min(1).optional() }).strict()
}).strict()
const WorkSessionPauseRequestSchema = z.object({
  requestId: id,
  input: z.object({ id }).strict()
}).strict()
const EmptyRequestSchema = z.object({}).strict()
const WorkflowGetRequestSchema = z.object({ id }).strict()
export const WorkflowProjectionEventSchema = ProjectionEventSchema.extend({
  payload: WorkflowRunSchema
})

export const V2PublicIpcSchemas = Object.freeze({
  'workSession.create': { request: WorkSessionCreateRequestSchema, response: WorkSessionSchema },
  'workSession.pause': { request: WorkSessionPauseRequestSchema, response: WorkSessionSchema },
  'provider.listAccounts': { request: EmptyRequestSchema, response: z.array(ProviderAccountSummarySchema) },
  'workflow.get': { request: WorkflowGetRequestSchema, response: WorkflowRunSchema },
  'workflow.projection': { event: WorkflowProjectionEventSchema }
})
