import { describe, expect, it } from 'vitest'
import { acceptChatEvent, acceptUsageSnapshot } from '../../src/renderer/src/components/chat/chat-event-scope'
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

describe('usage snapshot scope', () => {
  const active = { projectPath: '/proj', sessionId: 'second', agentId: 'new-agent', revision: 2 }

  it('rejects delayed usage and limits from a previously selected session or agent', () => {
    expect(acceptUsageSnapshot(active, { ...active, sessionId: 'first' })).toBe(false)
    expect(acceptUsageSnapshot(active, { ...active, agentId: 'old-agent' })).toBe(false)
    expect(acceptUsageSnapshot(active, { ...active, projectPath: '/other' })).toBe(false)
    expect(acceptUsageSnapshot(active, active)).toBe(true)
  })

  it('rejects older snapshots after newer usage has arrived in the same session', () => {
    expect(acceptUsageSnapshot(active, { ...active, revision: 1 })).toBe(false)
  })
})
