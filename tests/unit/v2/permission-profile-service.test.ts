import { expect, it } from 'vitest'
import { resolveEffectivePermission } from '../../../src/main/v2/application/security/permission-profile-service'

it('hard deny cannot be overridden and records its source', () => {
  expect(resolveEffectivePermission({ hardSecurity: 'DENY', workSession: 'ALLOW', agent: 'ALLOW',
    project: 'ALLOW', global: 'ALLOW' })).toEqual({
    decision: 'DENY', source: 'HARD_SECURITY', reason: 'hard security policy'
  })
})

it('uses existing specificity order with explicit source and reason', () => {
  expect(resolveEffectivePermission({ global: 'ALLOW', project: 'DENY' }))
    .toEqual({ decision: 'DENY', source: 'PROJECT', reason: 'project policy' })
  expect(resolveEffectivePermission({ global: 'DENY', project: 'DENY', agent: 'ALLOW' }))
    .toEqual({ decision: 'ALLOW', source: 'AGENT', reason: 'agent policy' })
  expect(resolveEffectivePermission({})).toEqual({
    decision: 'ASK', source: 'DEFAULT', reason: 'no configured policy'
  })
})
