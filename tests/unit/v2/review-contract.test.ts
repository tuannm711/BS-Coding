import { describe, expect, it } from 'vitest'
import { FindingSchema, QualityGateSchema, ReviewSchema } from '../../../src/shared/v2/schemas/review'

describe('review and gate contracts', () => {
  it('requires evidence for blocking findings', () => {
    expect(FindingSchema.safeParse({ id: 'f1', reviewId: 'r1', severity: 'HIGH',
      blocking: true, category: 'security', description: 'Missing state', evidenceRefs: [],
      affectedFiles: ['src/auth.ts'], reviewerAgentVersionId: 'av', status: 'OPEN' }).success)
      .toBe(false)
  })

  it('accepts structured reviews and deterministic gates', () => {
    expect(ReviewSchema.safeParse({ id: 'r', workflowRunId: 'wf', reviewerAgentVersionId: 'av',
      scope: ['src/auth.ts'], decision: 'FAIL', findingIds: ['f'], createdAt: '2026-08-29T00:00:00.000Z' }).success)
      .toBe(true)
    expect(QualityGateSchema.safeParse({ id: 'g', scope: 'workflow', kind: 'MECHANICAL',
      blocking: true, status: 'PASS', command: 'npm test', exitCode: 0, durationMs: 10,
      artifactRefs: ['log'] }).success).toBe(true)
  })
})
