import { z } from 'zod'

const id = z.string().min(1)
export const FindingSchema = z.object({
  id, reviewId: id, severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  blocking: z.boolean(), category: id, description: id,
  evidenceRefs: z.array(id), affectedFiles: z.array(id), reviewerAgentVersionId: id,
  status: z.enum(['OPEN', 'ACCEPTED', 'FIXED', 'DISMISSED']), linkedReworkTaskId: id.optional()
}).superRefine((finding, context) => {
  if (finding.blocking && finding.evidenceRefs.length === 0) {
    context.addIssue({ code: 'custom', path: ['evidenceRefs'],
      message: 'blocking finding requires evidence' })
  }
})

export const ReviewSchema = z.object({
  id, workflowRunId: id, reviewerAgentVersionId: id, scope: z.array(id).min(1),
  decision: z.enum(['PASS', 'PASS_WITH_SUGGESTIONS', 'FAIL', 'BLOCKED']),
  findingIds: z.array(id), createdAt: z.iso.datetime({ offset: true })
})

export const QualityGateSchema = z.object({
  id, scope: id, kind: z.enum(['MECHANICAL', 'SPECIALIST_REVIEW']), blocking: z.boolean(),
  status: z.enum(['PENDING', 'RUNNING', 'PASS', 'FAIL', 'BLOCKED']),
  command: id.optional(), exitCode: z.number().int().optional(),
  durationMs: z.number().nonnegative().optional(), artifactRefs: z.array(id)
})
