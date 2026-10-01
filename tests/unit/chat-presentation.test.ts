import { describe, expect, it } from 'vitest'
import { finalResponseIds, mergeTranscriptSnapshot, toolActivityStatus } from '../../src/renderer/src/components/chat/chat-presentation'
import type { FeedItem } from '../../src/renderer/src/components/chat/FeedRow'
import type { TurnExecutionSnapshot } from '../../src/shared/types'

const execution: TurnExecutionSnapshot = { turnId: 't1', agentId: 'a', agentName: 'Agent', speed: 'standard', startedAt: 1000, completedAt: 2000, status: 'completed' }
const message = (id: string, text = 'Answer', status = execution.status): Extract<FeedItem, { kind: 'message' }> => ({ kind: 'message', id, role: 'assistant', text, turnId: 't1', execution: { ...execution, status } })

describe('chat presentation', () => {
  it('keeps earlier history when live deltas arrive before the initial transcript request returns', () => {
    const old = { ...message('old', 'Earlier result'), turnId: 'old-turn', execution: { ...execution, turnId: 'old-turn' } }
    const user: FeedItem = { kind: 'message', id: 'user', role: 'user', text: 'Continue', turnId: 't1' }
    const live = message('a-live', 'Streaming tail', 'running')
    expect(mergeTranscriptSnapshot([old, user], [live])).toEqual([old, user, live])
  })

  it('reconciles already persisted live steps and tool results without duplicate prose', () => {
    const saved = message('stored', 'Read the whole file', 'running')
    const tool: FeedItem = { kind: 'tool', id: 'read', call: { id: 'read', tool: 'read', turnId: 't1', input: {}, permission: 'pending' } }
    const updated: FeedItem = { ...tool, call: { ...tool.call, output: 'contents', permission: 'allowed' } }
    const merged = mergeTranscriptSnapshot([saved, tool], [message('a-live', 'whole file', 'running'), updated])
    expect(merged).toEqual([{ ...saved, id: 'a-live' }, updated])
  })

  it('does not merge a new final response into an earlier reasoning-only step', () => {
    const thinking = { ...message('thinking', '', 'running'), reasoning: 'Inspecting the file' }
    const tool: FeedItem = { kind: 'tool', id: 'read', call: { id: 'read', tool: 'read', turnId: 't1', input: {}, permission: 'allowed', output: 'contents' } }
    const final = message('a-final', 'The final response')
    expect(mergeTranscriptSnapshot([thinking, tool], [final])).toEqual([thinking, tool, final])
  })

  it('keeps identical progress and final text on opposite sides of a tool boundary', () => {
    const progress = message('progress', 'Done', 'running')
    const tool: FeedItem = { kind: 'tool', id: 'read', call: { id: 'read', tool: 'read', turnId: 't1', input: {}, permission: 'allowed', output: 'contents' } }
    const final = message('a-final', 'Done')
    expect(mergeTranscriptSnapshot([progress, tool], [final])).toEqual([progress, tool, final])
  })
  it('offers copy only for the final text of each successful turn, never intermediate updates', () => {
    const items: FeedItem[] = [message('progress'), { kind: 'tool', id: 'tool', call: { id: 'tool', tool: 'read', input: {}, permission: 'allowed', output: 'file', turnId: 't1' } }, message('final')]
    expect([...finalResponseIds(items)]).toEqual(['final'])
  })
  it('does not advertise partial, failed, stopped or tool-only turns as a final response', () => {
    for (const status of ['running', 'stopped', 'failed'] as const) expect(finalResponseIds([message('partial', 'Partial', status)]).size).toBe(0)
    expect(finalResponseIds([message('progress'), { kind: 'tool', id: 'tool', call: { id: 'tool', tool: 'read', input: {}, permission: 'allowed', output: 'file', turnId: 't1' } }]).size).toBe(0)
    expect(finalResponseIds([message('reasoning', '')]).size).toBe(0)
  })
  it('keeps earlier finals available while another turn streams', () => {
    expect([...finalResponseIds([message('first'), { ...message('second', 'Streaming', 'running'), turnId: 't2', execution: { ...execution, turnId: 't2', status: 'running' } }])]).toEqual(['first'])
  })
  it('reports tool errors and denied calls honestly, including a permitted call without output', () => {
    const call = { id: 'tool', tool: 'bash', input: {}, permission: 'allowed' as const }
    expect(toolActivityStatus(call)).toBe('Running')
    expect(toolActivityStatus({ ...call, output: '' })).toBe('Completed')
    expect(toolActivityStatus({ ...call, error: 'exit 1' })).toBe('Failed')
    expect(toolActivityStatus({ ...call, permission: 'denied' })).toBe('Denied')
  })
})
