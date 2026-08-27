import { describe, expect, it } from 'vitest'
import { compileNeutralContext, neutraliseItems } from '../../src/main/agent/neutral-context'
import { looksLikeNarratedToolCall } from '../../src/shared/narrated-tool-call'
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

describe('neutraliseItems', () => {
  it('gives every replayed call a fresh id', () => {
    // No provider may see another provider's identifiers.
    const out = neutraliseItems(items)
    const ids = out.flatMap(item => item.kind === 'tool' ? [item.tool.id] : [])
    expect(ids).not.toContain('call-openai-1')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('drops a call that never finished', () => {
    // An assistant message holding a call with no result is rejected outright.
    expect(JSON.stringify(neutraliseItems(items))).not.toContain('unfinished-call')
  })

  it('strips provider metadata from a call it keeps', () => {
    expect(JSON.stringify(neutraliseItems(items))).not.toContain('thoughtSignature')
  })

  it('keeps the tool, its input and its output', () => {
    const out = neutraliseItems(items)
    const tool = out.find(item => item.kind === 'tool')
    expect(tool && tool.kind === 'tool' && tool.tool.tool).toBe('read')
    expect(JSON.stringify(out)).toContain('abcdef')
  })
})

describe('compileNeutralContext', () => {
  it('preserves semantic history without replaying provider tool metadata', () => {
    const messages = compileNeutralContext(items, { toolOutputMaxChars: 4 })
    const serialized = JSON.stringify(messages)

    expect(serialized).not.toContain('thoughtSignature')
    expect(serialized).not.toContain('call-openai-1')
    expect(serialized).not.toContain('unfinished-call')
    expect(serialized).not.toContain('providerOptions')
    // Reversed deliberately. This asserted `not.toContain('tool-call')`, and
    // that assertion was the design decision rather than a consequence of one:
    // a history with no tool calls in it is a history demonstrating that using
    // a tool looks like writing about one, which is exactly what models copied.
    expect(serialized).toContain('tool-call')
    expect(serialized).toContain('abcd')
    expect(serialized).toContain('[Incomplete response from Reviewer]')
  })

  it('answers every replayed call with its own result', () => {
    // Replaces "never emits two adjacent messages of the same role". That rule
    // existed because the records were forced into the user role beside real
    // user turns; native results carry their own `tool` role, so the property
    // worth pinning is now that no call is left unanswered.
    const messages = compileNeutralContext(items, { toolOutputMaxChars: 4 })
    const parts = (type: string) => messages.flatMap(message => Array.isArray(message.content)
      ? (message.content as Array<{ type: string; toolCallId?: string }>)
          .filter(part => part.type === type)
          .map(part => part.toolCallId)
      : [])
    const calls = parts('tool-call')
    expect(calls.length).toBeGreaterThan(0)
    expect(parts('tool-result')).toEqual(calls)
  })

  it('emits no session log header', () => {
    // There is no longer a format to explain, so nothing explains one.
    const serialized = JSON.stringify(compileNeutralContext(items, { toolOutputMaxChars: 4 }))
    expect(serialized).not.toContain('Session log')
    expect(serialized).not.toContain('read · completed')
  })

})

describe('looksLikeNarratedToolCall', () => {
  it('recognises a narrated call', () => {
    expect(looksLikeNarratedToolCall('[Tool bash · completed]\nInput: {"command":"ls"}\nOutput: a')).toBe(true)
    expect(looksLikeNarratedToolCall('text before\n\n[Tool read · failed]\nInput: {}\nError: no')).toBe(true)
  })

  it('recognises the record framing being imitated', () => {
    expect(looksLikeNarratedToolCall('[Session log — tools already run]\n- bash · completed\n  input: {}')).toBe(true)
  })

  it('recognises the record body without its header', () => {
    // What actually happened in the owner's session: the model copied the body
    // and dropped the header — the natural half to leave behind, since the
    // header says in words that it is not a format to reproduce.
    const narrated = [
      '- read · completed',
      '  input: {"file_path":"a.ts"}',
      '  output: ok'
    ].join('\n')
    expect(looksLikeNarratedToolCall(narrated)).toBe(true)
  })

  it('does not fire on a list item that merely names a tool', () => {
    expect(looksLikeNarratedToolCall(['- read the file first', '- then edit it'].join('\n'))).toBe(false)
  })

  it('does not fire on ordinary prose that mentions tools', () => {
    expect(looksLikeNarratedToolCall('I will use the bash tool to list files.')).toBe(false)
    expect(looksLikeNarratedToolCall('The [Tool] section of the docs explains Input: and Output:.')).toBe(false)
    expect(looksLikeNarratedToolCall('')).toBe(false)
  })
})

describe('a turn whose reply was only tool calls', () => {
  it('anchors a call for a tool that has no assistant message ahead of it', () => {
    const toolOnly: ChatTranscriptItem[] = [
      { kind: 'message', message: { id: 'u1', role: 'user', text: 'look', turnId: 't1', createdAt: 1 } },
      { kind: 'tool', tool: { id: 'c1', tool: 'read', input: { file_path: 'a.ts' }, output: 'x', permission: 'allowed', turnId: 't1', execution: execution('completed') } },
      { kind: 'message', message: { id: 'u2', role: 'user', text: 'again', turnId: 't2', createdAt: 2 } },
      { kind: 'tool', tool: { id: 'c2', tool: 'read', input: { file_path: 'b.ts' }, output: 'y', permission: 'allowed', turnId: 't2', execution: execution('completed') } }
    ]
    // A tool with no assistant message ahead of it used to be folded into a
    // user-role record. Natively it needs a call to answer, so the sanitiser
    // anchors one — otherwise the result refers to a call never made.
    const messages = compileNeutralContext(toolOnly, { toolOutputMaxChars: 20 })
    const parts = (type: string) => messages.flatMap(message => Array.isArray(message.content)
      ? (message.content as Array<{ type: string; toolCallId?: string }>)
          .filter(part => part.type === type)
          .map(part => part.toolCallId)
      : [])
    expect(parts('tool-call')).toHaveLength(2)
    expect(parts('tool-result')).toEqual(parts('tool-call'))
  })
})
