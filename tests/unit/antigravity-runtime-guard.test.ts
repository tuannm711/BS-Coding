import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLlm } from '../../src/main/agent/llm'

describe('Antigravity runtime transport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('routes OAuth bearer tokens to the Cloud Code SSE endpoint', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const body = `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] } })}\n\n`
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close() } })
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }))
    const stream = createLlm('antigravity', 'ya29.test-token').stream({
      model: 'gemini-3.1-pro-high',
      system: '',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{
        name: 'read',
        description: 'Read a file',
        schema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { value: { type: 'number', exclusiveMinimum: true } } },
        run: async () => ({ output: '' })
      }]
    })
    const parts = []
    for await (const part of stream) parts.push(part)
    expect(parts[0]).toMatchObject({ kind: 'text', text: 'ok' })
    expect(calls[0].url).toBe('https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse')
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer ya29.test-token')
    const payload = JSON.parse(String(calls[0].init?.body)) as { request: { tools: Array<{ functionDeclarations: Array<{ parameters: Record<string, unknown> }> }> } }
    expect(payload.request.tools[0].functionDeclarations[0].parameters).not.toHaveProperty('$schema')
    expect(payload.request.tools[0].functionDeclarations[0].parameters).not.toHaveProperty('properties.value.exclusiveMinimum')
  })
})
