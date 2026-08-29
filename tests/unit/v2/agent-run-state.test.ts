import { describe, expect, it } from 'vitest'
import { transitionAgentRun } from '../../../src/main/v2/domain/agent/agent-run-state'

describe('AgentRun state machine', () => {
  it('follows CREATED to SUCCEEDED lifecycle', () => {
    const starting = transitionAgentRun({ status: 'CREATED' }, { type: 'START' })
    const running = transitionAgentRun(starting, { type: 'STARTED' })
    expect(transitionAgentRun(running, { type: 'SUCCEED' }).status).toBe('SUCCEEDED')
  })

  it('cannot report success before running', () => {
    expect(() => transitionAgentRun(
      { status: 'CREATED' },
      { type: 'SUCCEED' }
    )).toThrow(/illegal/i)
  })

  it.each(['SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'DEGRADED'] as const)(
    'rejects transitions out of terminal status %s',
    status => {
      expect(() => transitionAgentRun({ status }, { type: 'START' })).toThrow(/terminal/i)
    }
  )
})
