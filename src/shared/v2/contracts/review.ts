export type ReviewDecision = 'PASS' | 'PASS_WITH_SUGGESTIONS' | 'FAIL' | 'BLOCKED'
export type FindingSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type FindingStatus = 'OPEN' | 'ACCEPTED' | 'FIXED' | 'DISMISSED'
export type GateStatus = 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL' | 'BLOCKED'

export interface ReviewRecord {
  id: string
  workflowRunId: string
  reviewerAgentVersionId: string
  scope: readonly string[]
  decision: ReviewDecision
  findingIds: readonly string[]
  createdAt: string
}

export interface ReviewFinding {
  id: string
  reviewId: string
  severity: FindingSeverity
  blocking: boolean
  category: string
  description: string
  evidenceRefs: readonly string[]
  affectedFiles: readonly string[]
  reviewerAgentVersionId: string
  status: FindingStatus
  linkedReworkTaskId?: string
}

export interface QualityGate {
  id: string
  scope: string
  kind: 'MECHANICAL' | 'SPECIALIST_REVIEW'
  blocking: boolean
  status: GateStatus
  command?: string
  exitCode?: number
  durationMs?: number
  artifactRefs: readonly string[]
}
