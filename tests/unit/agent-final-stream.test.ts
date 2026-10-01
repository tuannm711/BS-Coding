import { describe, expect, it } from 'vitest'
import { SessionRunner } from '../../src/main/agent/loop'
import type { LlmClient, LlmStreamOptions, LlmStreamPart } from '../../src/main/agent/llm'
import type { ChatEvent, MessageTokens } from '../../src/shared/types'
import type { TranscriptItem } from '../../src/main/agent/message'
import { z } from 'zod'
import { latestContextTokens } from '../../src/shared/usage'
import { toLlmMessages } from '../../src/main/agent/message'

function harness(queue: Array<Array<LlmStreamPart | Error>>, onPart?: (part: LlmStreamPart) => void) {
  const items: TranscriptItem[] = []
  const events: ChatEvent[] = []
  const requests: LlmStreamOptions[] = []
  const usage: MessageTokens[] = []
  const llm: LlmClient = { async *stream(options) {
    requests.push(options)
    for (const part of queue.shift() ?? []) {
      if (part instanceof Error) throw part
      yield part
      onPart?.(part)
    }
  } }
  let toolRuns = 0
  const runner = new SessionRunner({
    agentId: 'a', model: 'fixture', system: '', cwd: '/fixture', llm,
    tools: new Map([['read', { name: 'read', description: '', schema: z.object({}), run: async () => { toolRuns++; return { output: 'read-result' } } }]]),
    decidePermission: () => 'allow', ask: async () => null,
    getItems: () => items, appendMessage: message => items.push({ kind: 'message', message }),
    appendTool: tool => items.push({ kind: 'tool', tool }), onEvent: event => events.push(event),
    onUsage: tokens => usage.push(tokens)
  })
  return { runner, items, events, requests, usage, toolRuns: () => toolRuns }
}

function text(h: ReturnType<typeof harness>): string {
  return h.items.flatMap(item => item.kind === 'message' ? [item.message.text] : []).join('')
}

describe('final response streaming', () => {
  it('preserves repeated characters in long fragmented responses', async () => {
    const expected = 'bookkeeper!! **bold**\n'.repeat(1000)
    const h = harness([[...Array.from(expected, value => ({ kind: 'text' as const, text: value })), { kind: 'finish', finishReason: 'stop' }]])
    await h.runner.run()
    expect(text(h)).toBe(expected)
    expect(h.events.flatMap(event => event.type === 'text-delta' ? [event.delta] : []).join('')).toBe(expected)
  })

  it('continues genuine output budget finishes with no tools and one persisted final answer', async () => {
    const h = harness([
      [{ kind: 'text', text: 'book' }, { kind: 'finish', finishReason: 'length', tokens: { input: 10, output: 4, total: 14 } }],
      [{ kind: 'text', text: 'keeper' }, { kind: 'finish', finishReason: 'MAX_TOKENS', tokens: { input: 20, output: 6, total: 26 } }],
      [{ kind: 'text', text: ' ending' }, { kind: 'finish', finishReason: 'stop', tokens: { input: 30, output: 7, total: 37 } }]
    ])
    await h.runner.run()
    expect(text(h)).toBe('bookkeeper ending')
    expect(h.items).toHaveLength(1)
    expect(h.requests).toHaveLength(3)
    expect(h.requests.slice(1).every(request => request.tools.length === 0)).toBe(true)
    expect(JSON.stringify(h.requests[2].messages)).toContain('bookkeeper')
    expect(h.usage).toHaveLength(3)
    expect(h.events.at(-1)).toMatchObject({ type: 'done', reason: 'complete' })
  })

  it('bounds continuation attempts and retains all partial text when the budget repeats', async () => {
    const h = harness(Array.from({ length: 4 }, () => [{ kind: 'text', text: 'x' }, { kind: 'finish', finishReason: 'length' }]))
    await h.runner.run()
    expect(h.requests).toHaveLength(3)
    expect(text(h)).toBe('xxx')
    expect(h.events.at(-1)).toMatchObject({ type: 'error' })
  })

  it.each([undefined, 'unknown', 'content-filter'])('does not claim completion for absent or unsuccessful termination %s', async finishReason => {
    const parts: LlmStreamPart[] = [{ kind: 'text', text: 'partial' }]
    if (finishReason) parts.push({ kind: 'finish', finishReason })
    const h = harness([parts])
    await h.runner.run()
    expect(h.requests).toHaveLength(1)
    expect(text(h)).toBe('partial')
    expect(h.events.at(-1)).toMatchObject({ type: 'error' })
  })

  it('preserves earlier continuation text on a socket error without restarting the response', async () => {
    const h = harness([
      [{ kind: 'text', text: 'prefix ' }, { kind: 'finish', finishReason: 'length' }],
      [{ kind: 'text', text: 'tail' }, new Error('socket reset')]
    ])
    await h.runner.run()
    expect(text(h)).toBe('prefix tail')
    expect(h.requests).toHaveLength(2)
    expect(h.events.at(-1)).toMatchObject({ type: 'error' })
  })

  it.each(['socket-error', 'eof', 'stopped'])('does not reuse earlier usage for an unmeasured continuation ending in %s', async ending => {
    const measured = { input: 10, output: 5, total: 15 }
    const controller = new AbortController()
    const second: Array<LlmStreamPart | Error> = [{ kind: 'text', text: 'unmeasured tail' }]
    if (ending === 'socket-error') second.push(new Error('socket reset'))
    const h = harness([
      [{ kind: 'text', text: 'measured prefix ' }, { kind: 'finish', finishReason: 'length', tokens: measured }],
      second
    ], part => { if (ending === 'stopped' && part.text === 'unmeasured tail') controller.abort() })
    await h.runner.run(controller.signal)
    expect(text(h)).toBe('measured prefix unmeasured tail')
    expect(h.usage).toEqual([measured])
    expect(h.items[0].kind === 'message' && h.items[0].message.tokens).toBeUndefined()
  })

  it('accounts provider-reported usage on an error part without a success marker', async () => {
    const h = harness([[{ kind: 'text', text: 'partial' }, { kind: 'error', error: 'upstream failure', tokens: { input: 10, output: 5, total: 15 } }]])
    await h.runner.run()
    expect(h.usage).toEqual([{ input: 10, output: 5, total: 15 }])
    expect(text(h)).toBe('partial')
    expect(h.items[0].kind === 'message' && h.items[0].message.tokens).toEqual({ input: 10, output: 5, total: 15 })
    expect(h.events.at(-1)).toMatchObject({ type: 'error' })
  })

  it.each(['stop', 'error'])('persists an input-only measured response ending in %s without adding an empty model message', async ending => {
    const measured = { input: 100, output: 0, total: 100 }
    const parts: LlmStreamPart[] = ending === 'stop' ? [{ kind: 'finish', finishReason: 'stop', tokens: measured }] : [{ kind: 'error', error: 'upstream error', tokens: measured }]
    const h = harness([parts])
    h.items.push({ kind: 'message', message: { id: 'old', role: 'assistant', text: 'older', tokens: { input: 10, output: 1, total: 11 }, createdAt: 1 } })
    h.items.push({ kind: 'message', message: { id: 'new', role: 'user', text: 'new request', createdAt: 2 } })
    await h.runner.run()
    expect(h.usage).toEqual([measured])
    expect(latestContextTokens(h.items)).toBe(100)
    const messages = toLlmMessages(h.items)
    expect(messages.every(message => typeof message.content === 'string' || message.content.length > 0)).toBe(true)
  })

  it('records measured terminal usage already received when Stop wins the race', async () => {
    const measured = { input: 10, output: 5, total: 15 }
    const controller = new AbortController()
    const h = harness([[{ kind: 'text', text: 'partial' }, { kind: 'finish', finishReason: 'stop', tokens: measured }]], part => { if (part.kind === 'text') controller.abort() })
    await h.runner.run(controller.signal)
    expect(h.usage).toEqual([measured])
    expect(h.items[0].kind === 'message' && h.items[0].message.tokens).toEqual(measured)
    expect(h.events.at(-1)).toMatchObject({ type: 'done', reason: 'stopped' })
  })

  it('never continues after user Stop at a token budget boundary', async () => {
    const controller = new AbortController()
    const h = harness([[{ kind: 'text', text: 'partial' }, { kind: 'finish', finishReason: 'length' }]], part => {
      if (part.kind === 'finish') controller.abort()
    })
    await h.runner.run(controller.signal)
    expect(text(h)).toBe('partial')
    expect(h.requests).toHaveLength(1)
    expect(h.events.at(-1)).toMatchObject({ type: 'done', reason: 'stopped' })
  })

  it('does not execute tool calls from a request that exhausts its output budget', async () => {
    const h = harness([[{ kind: 'tool-call', toolCallId: 'call', toolName: 'read', toolInput: {} }, { kind: 'finish', finishReason: 'length' }]])
    await h.runner.run()
    expect(h.toolRuns()).toBe(0)
    expect(h.requests).toHaveLength(1)
    expect(h.events.at(-1)).toMatchObject({ type: 'error' })
  })

  it('executes a completed tool step only once before final answer continuation', async () => {
    const h = harness([
      [{ kind: 'tool-call', toolCallId: 'call', toolName: 'read', toolInput: {} }, { kind: 'finish', finishReason: 'tool-calls' }],
      [{ kind: 'text', text: 'prefix ' }, { kind: 'finish', finishReason: 'length' }],
      [{ kind: 'text', text: 'ending' }, { kind: 'finish', finishReason: 'stop' }]
    ])
    await h.runner.run()
    expect(h.toolRuns()).toBe(1)
    expect(text(h)).toBe('prefix ending')
    expect(h.requests.at(-1)?.tools).toEqual([])
    expect(h.events.at(-1)).toMatchObject({ type: 'done', reason: 'complete' })
  })
})
