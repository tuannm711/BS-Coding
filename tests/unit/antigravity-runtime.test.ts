import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelMessage } from 'ai'
import { createAntigravityLlm } from '../../src/main/agent/antigravity-llm'
import { ANTIGRAVITY_ENTITY_404 } from '../fixtures/provider-chat-fixtures'

describe('Antigravity Cloud Code runtime', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('serializes assistant tool calls and tool results for continuation', async () => {
    let requestBody: any
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      const event = `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'continued' }] }, finishReason: 'STOP' }] } })}\n\n`
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(event)); controller.close() } }), { status: 200 })
    }))
    const messages: ModelMessage[] = [
      { role: 'user', content: 'read package.json' },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'read', input: { path: 'package.json' }, providerOptions: { google: { thoughtSignature: 'signature-1' } } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'read', output: { type: 'text', value: '{"name":"bs-coding"}' } }] }
    ]
    const parts = []
    for await (const part of createAntigravityLlm('token').stream({ model: 'gemini-3.1-pro-high', system: '', messages, tools: [] })) parts.push(part)

    expect(requestBody.request.contents).toEqual([
      { role: 'user', parts: [{ text: 'read package.json' }] },
      { role: 'model', parts: [{ functionCall: { id: 'call-1', name: 'read', args: { path: 'package.json' } }, thoughtSignature: 'signature-1' }] },
      { role: 'user', parts: [{ functionResponse: { id: 'call-1', name: 'read', response: { output: '{"name":"bs-coding"}' } } }] }
    ])
    expect(parts).toContainEqual({ kind: 'text', text: 'continued' })
  })

  it('keeps the thought signature returned with a function call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const event = `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ functionCall: { id: 'provider-call-1', name: 'read', args: { path: 'package.json' } }, thoughtSignature: 'signature-from-gemini' }] }, finishReason: 'STOP' }] } })}\n\n`
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(event)); controller.close() } }), { status: 200 })
    }))

    const parts = []
    for await (const part of createAntigravityLlm('token').stream({ model: 'gemini-3.6-flash', system: '', messages: [{ role: 'user', content: 'read' }], tools: [] })) parts.push(part)

    expect(parts).toContainEqual(expect.objectContaining({ kind: 'tool-call', toolCallId: 'provider-call-1', toolName: 'read', thoughtSignature: 'signature-from-gemini' }))
  })

  it('uses the Gemini 3 compatibility sentinel for a legacy unsigned tool call', async () => {
    let requestBody: any
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response('data: {"response":{"candidates":[{"finishReason":"STOP"}]}}\n\n', { status: 200 })
    }))
    const messages: ModelMessage[] = [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'legacy-call', toolName: 'read', input: { path: 'README.md' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'legacy-call', toolName: 'read', output: { type: 'text', value: 'ok' } }] }
    ]

    for await (const _part of createAntigravityLlm('token', { isGemini3: true }).stream({ model: 'MODEL_PLACEHOLDER_M72', system: '', messages, tools: [] })) { /* consume */ }

    expect(requestBody.request.contents[0].parts[0].thoughtSignature).toBe('skip_thought_signature_validator')
  })

  it('returns distinct provider errors without retrying a 429 response', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429, headers: { 'retry-after': '120' } }))
    vi.stubGlobal('fetch', fetchMock)
    const parts = []
    for await (const part of createAntigravityLlm('token').stream({ model: 'gemini-3.1-pro-high', system: '', messages: [{ role: 'user', content: 'hi' }], tools: [] })) parts.push(part)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(parts).toEqual([expect.objectContaining({ kind: 'error', error: expect.stringContaining('RESOURCE_EXHAUSTED') })])
  })

  it('uses the resolved account project and the Cloud Code runtime model id', async () => {
    let calledUrl = ''
    let requestBody: any
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calledUrl = url
      requestBody = JSON.parse(String(init?.body))
      return new Response('data: {"response":{"candidates":[{"finishReason":"STOP"}]}}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }))

    for await (const _part of createAntigravityLlm('token', { projectId: 'real-project', modelId: 'MODEL_PLACEHOLDER_M72' }).stream({ model: 'gemini-3.6-flash-medium', system: '', messages: [{ role: 'user', content: 'hi' }], tools: [] })) { /* consume */ }

    expect(calledUrl).toBe('https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse')
    expect(requestBody).toMatchObject({ project: 'real-project', model: 'MODEL_PLACEHOLDER_M72', userAgent: 'antigravity' })
  })

  it('classifies a stale Cloud Code entity as recoverable runtime context', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(ANTIGRAVITY_ENTITY_404), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })))

    const parts = []
    for await (const part of createAntigravityLlm('fixture-token', { projectId: 'stale-project', modelId: 'MODEL_OLD' })
      .stream({ model: 'claude-sonnet-4-6', system: '', messages: [{ role: 'user', content: 'hello' }], tools: [] })) parts.push(part)

    expect(parts).toContainEqual(expect.objectContaining({
      kind: 'error',
      error: expect.stringContaining('runtime-entity-not-found')
    }))
  })
})
