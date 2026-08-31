import { describe, expect, it } from 'vitest'
import { createReviewService, reviewPasses } from '../../../src/main/v2/application/review/review-service'

describe('specialist review ingestion', () => {
  it('persists a structured failed review and its evidenced findings', async () => {
    const reviews: unknown[] = []
    const findings: unknown[] = []
    const writes: string[] = []
    const service = createReviewService({
      nextId: (() => { let id = 0; return () => `id-${++id}` })(),
      now: () => '2026-08-29T00:00:00.000Z',
      saveReview: async review => { writes.push('review'); reviews.push(review) },
      saveFinding: async finding => { writes.push('finding'); findings.push(finding) },
      transaction: async operation => operation()
    })
    const result = await service.ingest({ workflowRunId: 'wf', reviewerAgentVersionId: 'av',
      scope: ['src/auth.ts'], decision: 'FAIL', findings: [{ severity: 'HIGH', blocking: true,
        category: 'security', description: 'Missing state validation', evidenceRefs: ['log'],
        affectedFiles: ['src/auth.ts'], status: 'OPEN' }] })
    expect(result.blocked).toBe(true)
    expect(reviews).toHaveLength(1)
    expect(findings).toHaveLength(1)
    expect(writes).toEqual(['review', 'finding'])
  })

  it('rejects malformed structured findings before persistence', async () => {
    let writes = 0
    const service = createReviewService({ nextId: () => 'id', now: () => '2026-08-29T00:00:00.000Z',
      saveReview: async () => { writes += 1 }, saveFinding: async () => { writes += 1 },
      transaction: async operation => operation() })
    await expect(service.ingest({ workflowRunId: 'wf', reviewerAgentVersionId: 'av', scope: ['x'],
      decision: 'FAIL', findings: [{ severity: 'HIGH', blocking: true, category: 'security',
        description: 'bad', evidenceRefs: [], affectedFiles: ['x'], status: 'OPEN' }] }))
      .rejects.toThrow(/evidence/i)
    expect(writes).toBe(0)
  })

  it('passes only when no blocking finding remains open', () => {
    expect(reviewPasses([{ blocking: true, status: 'OPEN' }])).toBe(false)
    expect(reviewPasses([{ blocking: true, status: 'FIXED' }])).toBe(true)
  })

  it('blocks a failed reviewer decision even when no finding is returned', async () => {
    const service = createReviewService({
      nextId: () => 'id',
      now: () => '2026-08-29T00:00:00.000Z',
      saveReview: async () => {},
      saveFinding: async () => {},
      transaction: async operation => operation()
    })

    const result = await service.ingest({
      workflowRunId: 'wf',
      reviewerAgentVersionId: 'av',
      scope: ['src/auth.ts'],
      decision: 'FAIL',
      findings: []
    })

    expect(result.blocked).toBe(true)
  })
})
