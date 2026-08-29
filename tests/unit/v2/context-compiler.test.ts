import { describe, expect, it } from 'vitest'
import { ContextCompiler } from '../../../src/main/v2/runtime/context/context-compiler'

const history = [{
  id: 'e1', type: 'USER_MESSAGE' as const, schemaVersion: 1 as const, sequence: 1,
  timestamp: '2026-08-29T00:00:00.000Z', projectId: 'p', workSessionId: 'w',
  workflowRunId: 'r', taskRunId: 't', agentRunId: 'a', correlationId: 'corr',
  payload: { text: 'fix auth' }
}]

describe('ContextCompiler', () => {
  it('rebuilds deterministic context from durable canonical state after restart', async () => {
    const dependencies = {
      loadEvents: async () => history,
      loadSystem: async () => ['security', 'agent'],
      loadArtifacts: async () => [{ id: 'artifact', summary: 'auth diff' }]
    }
    const input = { workSessionId: 'w', taskRunId: 't', agentRunId: 'a',
      goal: 'OAuth', task: 'Implement state validation', maxInputTokens: 4000 }
    const first = await new ContextCompiler(dependencies).compileForAgentRun(input)
    const restarted = await new ContextCompiler(dependencies).compileForAgentRun(input)
    expect(restarted).toEqual(first)
    expect(first.history).toEqual(history)
    expect(first.system).toEqual(['security', 'agent'])
    expect(first).not.toHaveProperty('providerConversationId')
    expect(first).not.toHaveProperty('runtimeContext')
  })

  it('includes only current task and agent history', async () => {
    const unrelated = { ...history[0], id: 'e2', taskRunId: 'other', payload: { text: 'unrelated' } }
    const compiler = new ContextCompiler({ loadEvents: async () => [...history, unrelated],
      loadSystem: async () => [], loadArtifacts: async () => [] })
    const packet = await compiler.compileForAgentRun({ workSessionId: 'w', taskRunId: 't',
      agentRunId: 'a', goal: 'OAuth', maxInputTokens: 1000 })
    expect(packet.history).toEqual(history)
  })
})
