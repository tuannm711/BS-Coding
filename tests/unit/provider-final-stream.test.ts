import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAIResponsesClient } from '../../src/main/agent/openai-responses'
import { decodeProviderResponse } from '../../src/main/agent/provider-stream'
import { createAntigravityLlm } from '../../src/main/agent/antigravity-llm'
import type { LlmStreamOptions, LlmStreamPart } from '../../src/main/agent/llm'
import { SessionRunner } from '../../src/main/agent/loop'
import type { TranscriptItem } from '../../src/main/agent/message'
import type { MessageTokens } from '../../src/shared/types'

const options: LlmStreamOptions = { model: 'fixture', system: '', messages: [], tools: [] }
const sse = (event: object) => `data: ${JSON.stringify(event)}\n\n`
async function collect(stream: AsyncGenerator<LlmStreamPart>) {
  const parts: LlmStreamPart[] = []
  for await (const part of stream) parts.push(part)
  return parts
}

describe('provider final streaming', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('permits a long stream of bounded frames beyond the aggregate byte budget', async () => {
    const frame = sse({ type: 'response.output_text.delta', delta: 'x' })
    const response = new Response(frame.repeat(1000), { headers: { 'content-type': 'text/event-stream' } })
    const decoded = []
    for await (const part of decodeProviderResponse(response, { maxBytes: 1024 })) decoded.push(part)
    expect(decoded).toHaveLength(1000)
    expect(decoded.every(part => part.kind === 'event')).toBe(true)
  })

  it('rejects an oversized unfinished frame and cancels the reader', async () => {
    let cancelled = false
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: ' + 'x'.repeat(2000))) }, cancel() { cancelled = true } })
    const decoded = []
    for await (const part of decodeProviderResponse(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }), { maxBytes: 1024 })) decoded.push(part)
    expect(decoded).toEqual([expect.objectContaining({ kind: 'parse-error' })])
    expect(cancelled).toBe(true)
  })

  it.each(['sse', 'json'])('preserves OpenAI output-budget termination and usage in %s', async mode => {
    const response = { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'partial' }] }], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } }
    const body = mode === 'json' ? JSON.stringify(response) : sse({ type: 'response.output_text.delta', delta: 'partial' }) + sse({ type: 'response.incomplete', response })
    const client = new OpenAIResponsesClient({ apiKey: 'fixture', fetchImpl: async () => new Response(body, { headers: { 'content-type': mode === 'json' ? 'application/json' : 'text/event-stream' } }) })
    const parts = await collect(client.stream(options))
    expect(parts.filter(part => part.kind === 'text').map(part => part.text).join('')).toBe('partial')
    expect(parts.at(-1)).toMatchObject({ kind: 'finish', finishReason: 'length', tokens: { input: 10, output: 5, total: 15 } })
  })

  it('surfaces response.failed instead of silently accepting partial output', async () => {
    const client = new OpenAIResponsesClient({ apiKey: 'fixture', fetchImpl: async () => new Response(sse({ type: 'response.failed', response: { status: 'failed', error: { message: 'upstream failure' } } }), { headers: { 'content-type': 'text/event-stream' } }) })
    expect(await collect(client.stream(options))).toContainEqual({ kind: 'error', error: 'upstream failure' })
  })

  it('fills a missing final delta from the completed text snapshot without duplicating text', async () => {
    const body = sse({ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'book' }) + sse({ type: 'response.output_text.done', output_index: 0, content_index: 0, text: 'bookkeeper' }) + sse({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'bookkeeper' }] }] } })
    const client = new OpenAIResponsesClient({ apiKey: 'fixture', fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }) })
    expect((await collect(client.stream(options))).filter(part => part.kind === 'text').map(part => part.text).join('')).toBe('bookkeeper')
  })

  it('deduplicates identified event replay while preserving identical new deltas', async () => {
    const body = [
      { type: 'response.output_text.delta', sequence_number: 1, delta: 'hello' },
      { type: 'response.output_text.delta', sequence_number: 1, delta: 'hello' },
      { type: 'response.output_text.delta', sequence_number: 2, delta: 'hello' },
      { type: 'response.completed', sequence_number: 3, response: { status: 'completed' } }
    ].map(sse).join('')
    const client = new OpenAIResponsesClient({ apiKey: 'fixture', fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }) })
    expect((await collect(client.stream(options))).filter(part => part.kind === 'text').map(part => part.text).join('')).toBe('hellohello')
  })

  it('retains provider-reported usage on terminal failure', async () => {
    const client = new OpenAIResponsesClient({ apiKey: 'fixture', fetchImpl: async () => new Response(sse({ type: 'response.failed', response: { status: 'failed', error: { message: 'upstream failure' }, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } }), { headers: { 'content-type': 'text/event-stream' } }) })
    expect((await collect(client.stream(options))).at(-1)).toMatchObject({ kind: 'error', tokens: { input: 10, output: 5, total: 15 } })
  })

  it('decodes fragmented UTF-8 long text and releases an early-closed stream', async () => {
    const expected = 'Xin chào 🧑🏽‍💻 **bookkeeper**\n'.repeat(1000)
    const bytes = new TextEncoder().encode(sse({ delta: expected }))
    let offset = 0
    let cancelled = false
    const body = new ReadableStream({ pull(controller) {
      // Keep the transport open after this frame to verify early return cleanup.
      if (offset >= bytes.length) return
      controller.enqueue(bytes.slice(offset, offset + 17))
      offset += 17
    }, cancel() { cancelled = true } })
    let actual = ''
    for await (const part of decodeProviderResponse(new Response(body, { headers: { 'content-type': 'text/event-stream' } }), { maxBytes: 1024 * 1024 })) {
      if (part.kind === 'event') { actual = String(part.event.delta); break }
    }
    expect(actual).toBe(expected)
    expect(cancelled).toBe(true)
  })

  it('uses the supplied supported Antigravity output budget and accounts response-level usage-only frames once', async () => {
    let request: any
    const body = sse({ response: { candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: 'MAX_TOKENS' }] } }) + sse({ response: { usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 40, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 125 } } })
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { request = JSON.parse(String(init.body)); return new Response(body, { headers: { 'content-type': 'text/event-stream' } }) })
    const parts = await collect(createAntigravityLlm('fixture').stream({ ...options, maxOutputTokens: 32768 } as LlmStreamOptions))
    expect(request.request.generationConfig.maxOutputTokens).toBe(32768)
    expect(parts.filter(part => part.kind === 'finish')).toEqual([{ kind: 'finish', finishReason: 'MAX_TOKENS', tokens: { input: 60, output: 25, reasoning: 5, total: 125, cacheRead: 40 } }])
  })

  it('retains usage when Antigravity reaches EOF without a candidate finish marker', async () => {
    const body = sse({ response: { candidates: [{ content: { parts: [{ text: 'partial' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } } })
    vi.stubGlobal('fetch', async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }))
    expect((await collect(createAntigravityLlm('fixture').stream(options))).at(-1)).toMatchObject({ kind: 'error', tokens: { input: 10, output: 5, total: 15 } })
  })

  it.each(['provider-error', 'parser-error', 'read-error'])('retains pending Antigravity usage on %s and never emits a success finish', async failure => {
    const usageFrame = sse({ response: { candidates: [{ content: { parts: [{ text: 'partial' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } } })
    const finishFrame = sse({ response: { candidates: [{ finishReason: 'STOP' }] } })
    const response = () => {
      if (failure === 'read-error') {
        let delivered = false
        return new Response(new ReadableStream({ pull(controller) {
          if (!delivered) { delivered = true; controller.enqueue(new TextEncoder().encode(usageFrame)) }
          else controller.error(new Error('socket reset'))
        } }), { headers: { 'content-type': 'text/event-stream' } })
      }
      const failureFrame = failure === 'parser-error' ? 'data: {broken\n\n' : sse({ response: { error: { message: 'upstream failure' } } })
      return new Response(usageFrame + failureFrame + finishFrame, { headers: { 'content-type': 'text/event-stream' } })
    }
    vi.stubGlobal('fetch', async () => response())
    const llm = createAntigravityLlm('fixture')
    const parts = await collect(llm.stream(options))
    expect(parts.filter(part => part.kind === 'finish')).toEqual([])
    expect(parts.filter(part => part.kind === 'error')).toEqual([expect.objectContaining({ tokens: { input: 10, output: 5, total: 15 } })])

    const items: TranscriptItem[] = []
    const usage: MessageTokens[] = []
    const runner = new SessionRunner({ agentId: 'fixture', model: 'fixture', system: '', cwd: '/fixture', llm, tools: new Map(), decidePermission: () => 'allow', ask: async () => null,
      getItems: () => items, appendMessage: message => items.push({ kind: 'message', message }), appendTool: tool => items.push({ kind: 'tool', tool }), onEvent: () => {}, onUsage: tokens => usage.push(tokens) })
    await runner.run()
    expect(usage).toEqual([{ input: 10, output: 5, total: 15 }])
    expect(items[0].kind === 'message' && items[0].message.text).toBe('partial')
  })

  it('retains usage reported in the same Antigravity error frame', async () => {
    const body = sse({ response: { error: { message: 'upstream failure' }, usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } } })
    vi.stubGlobal('fetch', async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }))
    expect(await collect(createAntigravityLlm('fixture').stream(options))).toEqual([{ kind: 'error', error: 'upstream failure', tokens: { input: 10, output: 5, total: 15 } }])
  })
})
