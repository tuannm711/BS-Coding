import { describe, expect, it } from 'vitest'
import { AccountRouter } from '../../../src/main/v2/runtime/routing/account-router'
import { selectBestAccount } from '../../../src/main/v2/runtime/routing/router-score'

const candidates = [
  { id: 'a', providerId: 'p', modelId: 'm', enabled: true, cooldown: false,
    quotaKnown: true, remaining: 80, activeRuns: 0, structuredTools: 'VERIFIED' as const },
  { id: 'b', providerId: 'p', modelId: 'm', enabled: true, cooldown: false,
    quotaKnown: true, remaining: 20, activeRuns: 0, structuredTools: 'VERIFIED' as const }
]

describe('account routing', () => {
  it('selects deterministically by health score', () => {
    expect(selectBestAccount(candidates).id).toBe('a')
    expect(selectBestAccount([...candidates].reverse()).id).toBe('a')
  })

  it('honors PINNED refusal and PREFERRED fallback', () => {
    const router = new AccountRouter()
    expect(() => router.route({ policy: 'PINNED', preferredAccountId: 'missing', candidates }))
      .toThrow(/pinned/i)
    expect(router.route({ policy: 'PREFERRED', preferredAccountId: 'b', candidates }).accountId).toBe('b')
  })

  it('filters degraded tool targets and remains sticky per epoch', () => {
    const router = new AccountRouter()
    const degraded = { ...candidates[0], structuredTools: 'DEGRADED' as const }
    const first = router.route({ policy: 'AUTO', candidates: [degraded, candidates[1]],
      requireStructuredTools: true, runtimeEpochId: 'epoch' })
    const second = router.route({ policy: 'AUTO', candidates, runtimeEpochId: 'epoch' })
    expect(first.accountId).toBe('b')
    expect(second).toBe(first)
    expect(Object.isFrozen(first.capabilities)).toBe(true)
    router.releaseEpoch('epoch')
    const rerouted = router.route({ policy: 'AUTO', candidates, runtimeEpochId: 'epoch' })
    expect(rerouted.accountId).toBe('a')
  })
})
