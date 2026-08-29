import { describe, expect, it } from 'vitest'
import { selectContextEvents } from '../../../src/main/v2/runtime/context/context-policy'

const event = (id: string, taskRunId: string, agentRunId: string, text: string) => ({
  id, type: 'USER_MESSAGE' as const, schemaVersion: 1 as const, sequence: 1,
  timestamp: '2026-08-29T00:00:00.000Z', projectId: 'p', workSessionId: 'w',
  workflowRunId: 'r', taskRunId, agentRunId, correlationId: id, payload: { text }
})

describe('context selection policy', () => {
  it('excludes unrelated task and agent events', () => {
    const selected = selectContextEvents([
      event('a', 'task-a', 'agent-a', 'A'),
      event('b', 'task-b', 'agent-a', 'B'),
      event('c', 'task-a', 'agent-b', 'C')
    ], { taskRunId: 'task-a', agentRunId: 'agent-a' })
    expect(selected.map(item => item.payload)).toEqual([{ text: 'A' }])
  })

  it('strips provider-native metadata from selected history', () => {
    const selected = selectContextEvents([{
      ...event('a', 'task-a', 'agent-a', 'A'), providerConversationId: 'native', thoughtSignature: 'secret'
    }], { taskRunId: 'task-a', agentRunId: 'agent-a' })
    expect(selected[0]).not.toHaveProperty('providerConversationId')
    expect(selected[0]).not.toHaveProperty('thoughtSignature')
  })
})
