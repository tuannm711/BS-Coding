import { describe, expect, it } from 'vitest'
import { ORCHESTRATOR_DENIED_TOOLS, createOrchestratorPolicy } from '../../../src/main/v2/application/agent/orchestrator-policy'

describe('Orchestrator policy', () => {
  it('hard-denies direct write, shell and recursive worker tools', () => {
    expect(ORCHESTRATOR_DENIED_TOOLS).toEqual(expect.arrayContaining([
      'write', 'edit', 'apply_patch', 'bash', 'revert', 'spawn_worker'
    ]))
    const policy = createOrchestratorPolicy({ proposeWorkflowCommand: async () => 'accepted' })
    for (const tool of ORCHESTRATOR_DENIED_TOOLS) {
      expect(policy.permissionFor(tool)).toBe('DENY')
    }
    expect(policy.permissionFor('read')).toBe('ALLOW')
    expect(policy.permissionFor('brand_new_write_tool')).toBe('DENY')
  })

  it('routes plan/task proposals through the WorkflowEngine boundary', async () => {
    const proposals: unknown[] = []
    const policy = createOrchestratorPolicy({
      proposeWorkflowCommand: async command => { proposals.push(command); return 'accepted' }
    })
    expect(await policy.propose({ type: 'CREATE_TASK', payload: { title: 'Implement' } }))
      .toBe('accepted')
    expect(proposals).toEqual([{ type: 'CREATE_TASK', payload: { title: 'Implement' } }])
  })
})
