import { describe, expect, it } from 'vitest'
import { canFinalize } from '../../../src/main/v2/application/review/final-verifier'
import {
  createReworkService,
  type ReworkTaskRecord
} from '../../../src/main/v2/application/review/rework-service'
import type { QualityGate, ReviewFinding, ReviewRecord } from '../../../src/shared/v2/contracts/review'

const passedGate: QualityGate = {
  id: 'gate-security',
  scope: 'security',
  kind: 'MECHANICAL',
  blocking: true,
  status: 'PASS',
  artifactRefs: ['artifact-gate']
}

const fixedFinding: ReviewFinding = {
  id: 'finding-1',
  reviewId: 'review-rerun',
  severity: 'HIGH',
  blocking: true,
  category: 'security',
  description: 'Missing state validation',
  evidenceRefs: ['artifact-review'],
  affectedFiles: ['src/auth.ts'],
  reviewerAgentVersionId: 'security-reviewer-v1',
  status: 'FIXED',
  linkedReworkTaskId: 'rework-1'
}

const passedReview: ReviewRecord = {
  id: 'review-rerun',
  workflowRunId: 'workflow-1',
  reviewerAgentVersionId: 'security-reviewer-v1',
  scope: ['src/auth.ts'],
  decision: 'PASS',
  findingIds: ['finding-1'],
  createdAt: '2026-08-29T00:05:00.000Z'
}

describe('rework and final verification lifecycle', () => {
  it('rejects worker success while a blocking gate or finding remains open', () => {
    expect(canFinalize({
      gates: [{ ...passedGate, status: 'FAIL' }],
      findings: [fixedFinding],
      reviews: [passedReview]
    })).toBe(false)
    expect(canFinalize({
      gates: [passedGate],
      findings: [{ ...fixedFinding, status: 'OPEN' }],
      reviews: [passedReview]
    })).toBe(false)
    expect(canFinalize({
      gates: [passedGate],
      findings: [fixedFinding],
      reviews: [{ ...passedReview, decision: 'BLOCKED' }]
    })).toBe(false)
    expect(canFinalize({
      gates: [passedGate],
      findings: [fixedFinding],
      reviews: [passedReview]
    })).toBe(true)
  })

  it('persists linked rework before the worker, reruns required checks, then completes', async () => {
    const order: string[] = []
    const saved: ReworkTaskRecord[] = []
    const links: Array<{ findingId: string; taskId: string }> = []
    const service = createReworkService({
      nextId: () => 'rework-1',
      now: () => '2026-08-29T00:01:00.000Z',
      transaction: async operation => {
        order.push('transaction:start')
        const result = await operation()
        order.push('transaction:commit')
        return result
      },
      saveReworkTask: async task => { order.push('task:save'); saved.push(task) },
      linkFinding: async (findingId, taskId) => {
        order.push(`finding:link:${findingId}`)
        links.push({ findingId, taskId })
      },
      dispatchAndAwaitWorker: async () => { order.push('worker:completed') },
      rerunRequiredGates: async () => { order.push('gates:rerun'); return [passedGate] },
      rerunFailedReviews: async () => {
        order.push('reviews:rerun')
        return { reviews: [passedReview], findings: [fixedFinding] }
      },
      completeWorkflow: async () => { order.push('workflow:complete') }
    })

    const result = await service.rework({
      workflowRunId: 'workflow-1',
      findingIds: ['finding-1'],
      title: 'Fix security review findings'
    })

    expect(saved[0]).toMatchObject({
      id: 'rework-1',
      workflowRunId: 'workflow-1',
      findingIds: ['finding-1']
    })
    expect(links).toEqual([{ findingId: 'finding-1', taskId: 'rework-1' }])
    expect(order).toEqual([
      'transaction:start',
      'task:save',
      'finding:link:finding-1',
      'transaction:commit',
      'worker:completed',
      'gates:rerun',
      'reviews:rerun',
      'workflow:complete'
    ])
    expect(result.completed).toBe(true)
  })

  it('does not emit completion when a rerun gate still fails', async () => {
    let completions = 0
    const service = createReworkService({
      nextId: () => 'rework-1',
      now: () => '2026-08-29T00:01:00.000Z',
      transaction: async operation => operation(),
      saveReworkTask: async () => {},
      linkFinding: async () => {},
      dispatchAndAwaitWorker: async () => {},
      rerunRequiredGates: async () => [{ ...passedGate, status: 'FAIL' }],
      rerunFailedReviews: async () => ({ reviews: [passedReview], findings: [fixedFinding] }),
      completeWorkflow: async () => { completions += 1 }
    })

    const result = await service.rework({
      workflowRunId: 'workflow-1',
      findingIds: ['finding-1'],
      title: 'Fix security review findings'
    })

    expect(result.completed).toBe(false)
    expect(completions).toBe(0)
  })

  it('rejects rework without findings before persistence or dispatch', async () => {
    let sideEffects = 0
    const service = createReworkService({
      nextId: () => 'rework-1',
      now: () => '2026-08-29T00:01:00.000Z',
      transaction: async operation => operation(),
      saveReworkTask: async () => { sideEffects += 1 },
      linkFinding: async () => { sideEffects += 1 },
      dispatchAndAwaitWorker: async () => { sideEffects += 1 },
      rerunRequiredGates: async () => { sideEffects += 1; return [passedGate] },
      rerunFailedReviews: async () => {
        sideEffects += 1
        return { reviews: [passedReview], findings: [fixedFinding] }
      },
      completeWorkflow: async () => { sideEffects += 1 }
    })

    await expect(service.rework({
      workflowRunId: 'workflow-1',
      findingIds: [],
      title: 'Invalid rework'
    })).rejects.toThrow(/finding/i)
    expect(sideEffects).toBe(0)
  })
})
