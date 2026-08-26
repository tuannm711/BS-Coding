import type { ProviderErrorState, ProviderQuotaGroup } from './types'

export type PoolState = 'ok' | 'quota-exhausted' | 'capacity-exhausted'

// A pool is blocked when any one of its windows is spent: the owner's
// claude-gpt pool reads 0% weekly and 100% for five hours, and the weekly cap
// blocks it regardless of the shorter one.
//
// The numbers are consulted as well as the recorded refusal, because the quota
// data already says a pool is empty. Waiting for a 429 would mean spending a
// request to learn something the provider has already reported.
export function poolState(
  group: ProviderQuotaGroup,
  poolErrors: Record<string, ProviderErrorState> | undefined
): PoolState {
  const recorded = poolErrors?.[group.id]
  if (recorded?.kind === 'capacity-exhausted') return 'capacity-exhausted'
  if (recorded?.kind === 'quota-exhausted') return 'quota-exhausted'
  // Unknown is not empty. Claiming exhaustion without a number would invent a
  // fact, which is how the false "Quota exhausted" badge happened in v1.1.2.
  const spent = group.windows.some(window => window.usageKnown && window.remainingPercent === 0)
  return spent ? 'quota-exhausted' : 'ok'
}
