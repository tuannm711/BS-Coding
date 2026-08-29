import type { QualityGate, ReviewFinding, ReviewRecord } from '../../../../shared/v2/contracts/review'

export interface FinalVerificationInput {
  gates: readonly Pick<QualityGate, 'blocking' | 'status'>[]
  findings: readonly Pick<ReviewFinding, 'blocking' | 'status'>[]
  reviews: readonly Pick<ReviewRecord, 'decision'>[]
}

export function canFinalize(input: FinalVerificationInput): boolean {
  const gatesPass = input.gates.every(gate => !gate.blocking || gate.status === 'PASS')
  const findingsClosed = input.findings.every(finding => !finding.blocking || finding.status !== 'OPEN')
  const reviewsPass = input.reviews.every(review =>
    review.decision === 'PASS' || review.decision === 'PASS_WITH_SUGGESTIONS')
  return gatesPass && findingsClosed && reviewsPass
}
