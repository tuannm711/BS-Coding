import { describe, expect, it } from 'vitest'
import { createApprovalService } from '../../../src/main/v2/application/approvals/approval-service'
import { resolvePermission } from '../../../src/main/v2/runtime/tools/permission-engine'

describe('tool permission resolution', () => {
  it('hard deny cannot be overridden', () => {
    expect(resolvePermission({ hardSecurity: 'DENY', workSession: 'ALLOW', agent: 'ALLOW',
      project: 'ALLOW', global: 'ALLOW' })).toBe('DENY')
  })

  it('uses the most specific defined policy after hard security', () => {
    expect(resolvePermission({ workSession: 'ASK', agent: 'ALLOW', project: 'DENY', global: 'ALLOW' })).toBe('ASK')
    expect(resolvePermission({ agent: 'ALLOW', project: 'DENY', global: 'ASK' })).toBe('ALLOW')
    expect(resolvePermission({ global: 'ASK' })).toBe('ASK')
  })
})

describe('approval service', () => {
  it('persists a durable approval request before returning', async () => {
    const events: unknown[] = []
    const service = createApprovalService({ append: async event => { events.push(event) } })
    const request = await service.request({ callId: 'c1', toolName: 'write', correlationId: 'corr' })
    expect(events).toEqual([request])
    expect(request).toMatchObject({ type: 'APPROVAL_REQUESTED', callId: 'c1' })
  })
})
