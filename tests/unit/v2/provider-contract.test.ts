import { describe, expect, it } from 'vitest'
import { AccountPolicySchema, RuntimeTargetSchema } from '../../../src/shared/v2/schemas/provider'

describe('provider routing contracts', () => {
  it.each(['AUTO', 'PREFERRED', 'PINNED'])('accepts account policy %s', policy => {
    expect(AccountPolicySchema.safeParse(policy).success).toBe(true)
  })

  it('rejects unknown policy and degraded required tools', () => {
    expect(AccountPolicySchema.safeParse('ACTIVE').success).toBe(false)
    expect(RuntimeTargetSchema.safeParse({
      providerId: 'p', accountId: 'a', modelId: 'm',
      capabilities: { structuredTools: 'DEGRADED' }
    }).success).toBe(true)
  })

  it('does not allow secret material in RuntimeTarget', () => {
    const parsed = RuntimeTargetSchema.parse({
      providerId: 'p', accountId: 'a', modelId: 'm', token: 'secret',
      capabilities: { structuredTools: 'VERIFIED' }
    })
    expect(parsed).not.toHaveProperty('token')
  })
})
