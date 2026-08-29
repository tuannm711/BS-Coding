import type { AccountPolicy, RuntimeTarget } from '../../../../shared/v2/contracts/provider'
import { selectBestAccount, type AccountCandidate } from './router-score'

export class AccountRouter {
  private readonly sticky = new Map<string, RuntimeTarget>()

  route(input: { policy: AccountPolicy; preferredAccountId?: string; candidates: readonly AccountCandidate[];
    requireStructuredTools?: boolean; runtimeEpochId?: string }): RuntimeTarget {
    if (input.runtimeEpochId) {
      const existing = this.sticky.get(input.runtimeEpochId)
      if (existing) return existing
    }
    const eligible = input.candidates.filter(candidate =>
      candidate.enabled && !candidate.cooldown &&
      (!input.requireStructuredTools || candidate.structuredTools === 'VERIFIED'))
    const preferred = eligible.find(candidate => candidate.id === input.preferredAccountId)
    if (input.policy === 'PINNED' && !preferred) throw new Error('pinned account is unavailable')
    const selected = input.policy !== 'AUTO' && preferred ? preferred : selectBestAccount(eligible)
    const target: RuntimeTarget = Object.freeze({ providerId: selected.providerId,
      accountId: selected.id, modelId: selected.modelId,
      capabilities: Object.freeze({ structuredTools: selected.structuredTools }) })
    if (input.runtimeEpochId) this.sticky.set(input.runtimeEpochId, target)
    return target
  }

  releaseEpoch(runtimeEpochId: string): void {
    this.sticky.delete(runtimeEpochId)
  }
}
