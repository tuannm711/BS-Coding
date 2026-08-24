import { describe, expect, it } from 'vitest'
import { CHAT_SESSION_SCHEMA_VERSION } from '../../src/shared/types'
import type {
  ProjectSessionSummary,
  ScopedChatEvent,
  SessionQueuedMessage,
  TurnExecutionSnapshot
} from '../../src/shared/types'

describe('shared session contracts', () => {
  it('scopes a turn to one project session and executing Agent', () => {
    expect(CHAT_SESSION_SCHEMA_VERSION).toBe(2)
    const execution: TurnExecutionSnapshot = {
      turnId: 'turn-1',
      agentId: 'reviewer',
      agentName: 'Reviewer',
      providerId: 'openai',
      accountId: 'acct-1',
      accountLabel: 'Pro',
      modelId: 'gpt-5.6-sol',
      modelLabel: 'GPT-5.6 SOL',
      speed: 'fast',
      startedAt: 1,
      status: 'running'
    }
    const summary: ProjectSessionSummary = {
      id: 'session-1',
      projectPath: 'C:/project',
      lastAgentId: 'reviewer',
      title: 'Review',
      messageCount: 2,
      createdAt: 1,
      updatedAt: 2
    }
    const event: ScopedChatEvent = {
      type: 'turn-started',
      projectPath: summary.projectPath,
      sessionId: summary.id,
      turnId: execution.turnId,
      agentId: execution.agentId
    }
    const queued: SessionQueuedMessage = { id: 'q1', agentId: 'reviewer', text: 'continue' }

    expect(event.sessionId).toBe('session-1')
    expect(queued.agentId).toBe('reviewer')
  })
})
