import { describe, expect, it } from 'vitest'
import { acceptChatEvent } from '../../src/renderer/src/components/chat/chat-event-scope'
import type { ChatEvent } from '../../src/shared/types'

describe('chat event scope', () => {
  const active = { projectPath: 'C:/project', sessionId: 'session-1', turnId: 'turn-1' }
  const event: ChatEvent = {
    type: 'text-delta', agentId: 'reviewer', delta: 'ok',
    projectPath: 'C:/project', sessionId: 'session-1', turnId: 'turn-1'
  }

  it('accepts only the active project and session', () => {
    expect(acceptChatEvent(active, event)).toBe(true)
    expect(acceptChatEvent(active, { ...event, sessionId: 'other' })).toBe(false)
    expect(acceptChatEvent(active, { ...event, projectPath: 'C:/other' })).toBe(false)
  })

  it('filters stale turn events only while an active turn is known', () => {
    expect(acceptChatEvent(active, { ...event, turnId: 'stale' })).toBe(false)
    expect(acceptChatEvent({ ...active, turnId: undefined }, { ...event, turnId: 'any' })).toBe(true)
  })
})
