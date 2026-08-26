export interface FallbackCandidate {
  agentId: string
  providerId: string
  modelId: string
  accountId?: string
}

// Ranked by how close a candidate is to the agent it replaces, not by how much
// quota it has. Quota only removes a candidate that cannot work.
function tierOf(from: FallbackCandidate, candidate: FallbackCandidate): number {
  if (candidate.providerId !== from.providerId) return 3
  return candidate.modelId === from.modelId ? 1 : 2
}

export function rankFallbackAgents(input: {
  from: FallbackCandidate
  candidates: FallbackCandidate[]
  isPoolSpent: (candidate: FallbackCandidate) => boolean
}): FallbackCandidate[] {
  return input.candidates
    .filter(candidate => candidate.agentId !== input.from.agentId)
    // Dropped before ranking, not tried and skipped: two agents on different
    // models can share one pool, so a spent pool rules out both.
    .filter(candidate => !input.isPoolSpent(candidate))
    .map((candidate, index) => ({ candidate, index, tier: tierOf(input.from, candidate) }))
    // Declaration order inside a tier. The trigger is exhaustion, so draining
    // one account before starting the next is right; spreading load would
    // empty them together.
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map(entry => entry.candidate)
}
