import type { CapabilityHealth } from '../../../../shared/v2/contracts/provider'

export interface AccountCandidate {
  id: string; providerId: string; modelId: string; enabled: boolean; cooldown: boolean
  quotaKnown: boolean; remaining?: number; activeRuns: number; structuredTools: CapabilityHealth
}

export function scoreAccount(candidate: AccountCandidate): number {
  if (!candidate.enabled || candidate.cooldown) return Number.NEGATIVE_INFINITY
  return (candidate.quotaKnown ? Math.max(0, candidate.remaining ?? 0) : 50) - candidate.activeRuns * 10
}

export function selectBestAccount(candidates: readonly AccountCandidate[]): AccountCandidate {
  const sorted = [...candidates].sort((a, b) => scoreAccount(b) - scoreAccount(a) || a.id.localeCompare(b.id))
  if (!sorted[0] || !Number.isFinite(scoreAccount(sorted[0]))) throw new Error('no eligible account target')
  return sorted[0]
}
