import { describe, expect, it } from 'vitest'
import { DEFAULT_AGENT_PROFILES } from '../../../src/main/v2/application/agent/default-agent-profiles'

describe('standard V2 agent profiles', () => {
  it('defines all eight distinct templates including security and QA', () => {
    expect(DEFAULT_AGENT_PROFILES.map(profile => profile.name)).toEqual([
      'Orchestrator', 'Architect', 'Backend Developer', 'Frontend Developer',
      'Code Reviewer', 'Security Reviewer', 'QA / Tester', 'Integration Agent'
    ])
    expect(DEFAULT_AGENT_PROFILES.find(profile => profile.name === 'Security Reviewer')?.responsibility)
      .not.toBe(DEFAULT_AGENT_PROFILES.find(profile => profile.name === 'QA / Tester')?.responsibility)
  })

  it('keeps templates immutable data with the Orchestrator as coordinator', () => {
    const orchestrator = DEFAULT_AGENT_PROFILES[0]
    expect(orchestrator).toMatchObject({ name: 'Orchestrator', role: 'COORDINATOR' })
    expect(Object.isFrozen(DEFAULT_AGENT_PROFILES)).toBe(true)
    expect(Object.isFrozen(orchestrator)).toBe(true)
  })
})
