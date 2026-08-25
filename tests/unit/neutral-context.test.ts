import { describe, expect, it } from 'vitest'
import { compileNeutralContext } from '../../src/main/agent/neutral-context'
import type { ChatTranscriptItem, TurnExecutionSnapshot } from '../../src/shared/types'

const execution = (status: TurnExecutionSnapshot['status']): TurnExecutionSnapshot => ({
  turnId: 'turn-1', agentId: 'reviewer', agentName: 'Reviewer', providerId: 'openai',
  modelId: 'gpt-5.6-sol', speed: 'standard', startedAt: 1, status
})

const items: ChatTranscriptItem[] = [
  { kind: 'message', message: { id: 'u1', role: 'user', text: 'inspect', turnId: 'turn-1', createdAt: 1 } },
  { kind: 'message', message: { id: 'a1', role: 'assistant', text: 'Reading.', turnId: 'turn-1', execution: execution('completed'), createdAt: 2 } },
  { kind: 'tool', tool: {
    id: 'call-openai-1', tool: 'read', input: { file_path: 'a.ts' }, output: 'abcdef',
    permission: 'allowed', thoughtSignature: 'google-secret-signature', turnId: 'turn-1', execution: execution('completed')
  } },
  { kind: 'message', message: { id: 'u2', role: 'user', text: 'continue', turnId: 'turn-2', createdAt: 3 } },
  { kind: 'message', message: { id: 'a2', role: 'assistant', text: 'Partial', turnId: 'turn-2', execution: { ...execution('failed'), turnId: 'turn-2' }, createdAt: 4 } },
  { kind: 'tool', tool: {
    id: 'unfinished-call', tool: 'write', input: { file_path: 'b.ts' }, permission: 'pending', turnId: 'turn-2'
  } }
]

describe('compileNeutralContext', () => {
  it('preserves semantic history without replaying provider tool metadata', () => {
    const messages = compileNeutralContext(items, { toolOutputMaxChars: 4 })
    const serialized = JSON.stringify(messages)

    expect(serialized).not.toContain('thoughtSignature')
    expect(serialized).not.toContain('call-openai-1')
    expect(serialized).not.toContain('unfinished-call')
    expect(serialized).not.toContain('providerOptions')
    expect(serialized).not.toContain('tool-call')
    expect(serialized).toContain('read · completed')
    expect(serialized).toContain('abcd')
    expect(serialized).toContain('[Incomplete response from Reviewer]')
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  })

  it('keeps tool records out of the assistant role', () => {
    const messages = compileNeutralContext(items, { toolOutputMaxChars: 4 })
    const assistant = messages.filter(message => message.role === 'assistant')
    for (const message of assistant) {
      expect(String(message.content)).not.toContain('read')
    }
    expect(JSON.stringify(messages)).toContain('read')
  })

  it('never emits two adjacent messages of the same role', () => {
    const messages = compileNeutralContext(items, { toolOutputMaxChars: 4 })
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].role).not.toBe(messages[i - 1].role)
    }
  })

  it('frames the record as a log rather than as speech', () => {
    const serialized = JSON.stringify(compileNeutralContext(items, { toolOutputMaxChars: 4 }))
    expect(serialized).toContain('Session log')
    expect(serialized).toContain('tool interface')
  })
})
