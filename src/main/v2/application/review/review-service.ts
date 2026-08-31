import type { FindingStatus, ReviewFinding, ReviewRecord } from '../../../../shared/v2/contracts/review'
import { FindingSchema, ReviewSchema } from '../../../../shared/v2/schemas/review'

export function reviewPasses(findings: readonly { blocking: boolean; status: FindingStatus }[]): boolean {
  return !findings.some(finding => finding.blocking && finding.status === 'OPEN')
}

export function createReviewService(deps: {
  nextId(): string
  now(): string
  saveReview(review: ReviewRecord): Promise<void>
  saveFinding(finding: ReviewFinding): Promise<void>
  transaction<T>(operation: () => Promise<T>): Promise<T>
}) {
  return {
    async ingest(input: {
      workflowRunId: string
      reviewerAgentVersionId: string
      scope: string[]
      decision: ReviewRecord['decision']
      findings: Array<Omit<ReviewFinding, 'id' | 'reviewId' | 'reviewerAgentVersionId'>>
    }) {
      const reviewId = deps.nextId()
      const findings = input.findings.map(finding => FindingSchema.parse({
        ...finding, id: deps.nextId(), reviewId,
        reviewerAgentVersionId: input.reviewerAgentVersionId
      })) as ReviewFinding[]
      const review = ReviewSchema.parse({
        id: reviewId, workflowRunId: input.workflowRunId,
        reviewerAgentVersionId: input.reviewerAgentVersionId,
        scope: input.scope, decision: input.decision,
        findingIds: findings.map(finding => finding.id), createdAt: deps.now()
      }) as ReviewRecord
      await deps.transaction(async () => {
        await deps.saveReview(review)
        for (const finding of findings) await deps.saveFinding(finding)
      })
      const failedDecision = review.decision === 'FAIL' || review.decision === 'BLOCKED'
      return { review, findings, blocked: failedDecision || !reviewPasses(findings) }
    }
  }
}
