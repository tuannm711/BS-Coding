import { describe, expect, it, vi } from 'vitest'
import type { ModelMessage } from 'ai'
import { OpenAIResponsesClient, toResponsesInput } from '../../src/main/agent/openai-responses'
import { decodeProviderResponse } from '../../src/main/agent/provider-stream'
import { bashTool } from '../../src/main/agent/tools/bash'
import { readTool } from '../../src/main/agent/tools/read'
import { createSkillTool } from '../../src/main/agent/tools/skill'
import {
  MALFORMED_THEN_VALID_SSE,
  MISLABELED_SSE,
  OPENAI_COMPLETED,
  SPLIT_SSE_CHUNKS,
  chunkedResponse
} from '../fixtures/provider-chat-fixtures'

describe('OpenAIResponsesClient', () => {
  it('sends Responses payload and stores continuation id', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'resp-1', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    const client = new OpenAIResponsesClient({ apiKey: 'sk-test', fetchImpl })
    const parts = []
    for await (const part of client.stream({ model: 'gpt-5.2-codex', system: 'sys', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: [] })) parts.push(part)
    expect(fetchImpl).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1] && (fetchImpl.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ store: false })
    expect(parts).toContainEqual({ kind: 'text', text: 'ok' })
    expect(client.state.previousResponseId).toBe('resp-1')
  })

  it('stores opaque compaction output and clears continuation', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ output: [{ type: 'compaction', encrypted_content: 'opaque' }] }), { status: 200 })) as unknown as typeof fetch
    const state = { previousResponseId: 'old' }
    const client = new OpenAIResponsesClient({ apiKey: 'sk-test', state, fetchImpl })
    expect(await client.compact([{ role: 'user', content: 'history' }], 'gpt-5.2-codex')).toBe(true)
    expect(state.previousResponseId).toBeUndefined()
    expect(state.compactedInput).toEqual([{ type: 'compaction', encrypted_content: 'opaque' }])
  })

  it('supports ChatGPT Codex backend headers for OAuth sessions', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 })) as unknown as typeof fetch
    const client = new OpenAIResponsesClient({
      apiKey: 'oauth-token',
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      headers: { 'ChatGPT-Account-ID': 'acct-1', originator: 'codex_vscode' },
      fetchImpl
    })
    for await (const _part of client.stream({ model: 'gpt-5.5', system: 'sys', messages: [], tools: [] })) { /* consume */ }
    expect(fetchImpl).toHaveBeenCalledWith('https://chatgpt.com/backend-api/codex/responses', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer oauth-token', 'ChatGPT-Account-ID': 'acct-1', originator: 'codex_vscode' })
    }))
  })

  it('sends priority service tier for Fast Codex turns', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 })) as unknown as typeof fetch
    const client = new OpenAIResponsesClient({ apiKey: 'oauth-token', fetchImpl })
    for await (const _part of client.stream({ model: 'gpt-5.6-sol', system: 'sys', messages: [], tools: [], serviceTier: 'priority' })) { /* consume */ }
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1] && (fetchImpl.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ service_tier: 'priority' })
  })

  it('sends required JSON Schema parameters for native tools', async () => {
    let requestBody: any
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(OPENAI_COMPLETED), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }) as unknown as typeof fetch
    const client = new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl })

    for await (const _part of client.stream({
      model: 'gpt-5.6-sol',
      system: 'Use tools.',
      messages: [{ role: 'user', content: 'inspect the project' }],
      tools: [readTool, bashTool, createSkillTool(() => undefined)]
    })) { /* consume */ }

    const byName = Object.fromEntries(requestBody.tools.map((item: any) => [item.name, item]))
    expect(byName.read.parameters.required).toContain('file_path')
    expect(byName.bash.parameters.required).toContain('command')
    expect(byName.skill.parameters.required).toContain('name')
    expect(JSON.stringify(requestBody.tools)).not.toContain('"$schema"')
  })

  it('preserves valid streamed function-call arguments', async () => {
    const events = [
      `data: ${JSON.stringify({
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          call_id: 'call-read',
          name: 'read',
          arguments: JSON.stringify({ file_path: 'package.json' })
        }
      })}\n\n`,
      `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'response-tools' } })}\n\n`
    ]
    const fetchImpl = vi.fn(async () => chunkedResponse(events)) as unknown as typeof fetch
    const client = new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl })
    const parts = []

    for await (const part of client.stream({
      model: 'gpt-5.6-sol', system: 'Use tools.', messages: [], tools: [readTool]
    })) parts.push(part)

    expect(parts).toContainEqual(expect.objectContaining({
      kind: 'tool-call', toolName: 'read', toolInput: { file_path: 'package.json' }
    }))
  })

  it('does not send AI SDK tool-call and tool-result content types to Responses', async () => {
    let requestBody: any
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(OPENAI_COMPLETED), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const client = new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl })
    for await (const _part of client.stream({
      model: 'gpt-5.6-codex',
      system: 'sys',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'inspect' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'reading' }, { type: 'tool-call', toolCallId: 'call-1', toolName: 'read', input: { file_path: 'a.ts' } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'read', output: { type: 'text', value: 'contents' } }] }
      ],
      tools: []
    })) { /* consume */ }

    expect(JSON.stringify(requestBody.input)).not.toContain('"type":"tool-call"')
    expect(JSON.stringify(requestBody.input)).not.toContain('"type":"tool-result"')
  })

  it('serializes text and tool continuation as explicit Responses input items', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'inspect' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'reading' }, { type: 'tool-call', toolCallId: 'call-1', toolName: 'read', input: { file_path: 'a.ts' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'read', output: { type: 'text', value: 'contents' } }] }
    ]
    expect(toResponsesInput(messages)).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'inspect' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'reading' }] },
      { type: 'function_call', call_id: 'call-1', name: 'read', arguments: '{"file_path":"a.ts"}' },
      { type: 'function_call_output', call_id: 'call-1', output: 'contents' }
    ])
  })

  it('decodes a mislabeled SSE response without throwing a raw SyntaxError', async () => {
    const fetchImpl = vi.fn(async () => new Response(MISLABELED_SSE, { status: 200, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch
    const client = new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl })
    const parts = []
    for await (const part of client.stream({ model: 'gpt-5.6-codex', system: 'sys', messages: [], tools: [] })) parts.push(part)
    expect(parts).toContainEqual({ kind: 'text', text: 'recovered' })
    expect(parts).toContainEqual(expect.objectContaining({ kind: 'finish' }))
  })

  it('decodes split CRLF SSE frames, comments, and DONE markers', async () => {
    const decoded = []
    for await (const item of decodeProviderResponse(chunkedResponse(SPLIT_SSE_CHUNKS), { maxBytes: 64 * 1024 })) decoded.push(item)
    expect(decoded).toContainEqual({ kind: 'event', event: { type: 'response.output_text.delta', delta: 'split' } })
    expect(decoded.some(item => item.kind === 'parse-error')).toBe(false)
  })

  it('reports one malformed SSE event and continues with later valid events', async () => {
    const decoded = []
    for await (const item of decodeProviderResponse(new Response(MALFORMED_THEN_VALID_SSE, { headers: { 'content-type': 'text/event-stream' } }), { maxBytes: 64 * 1024 })) decoded.push(item)
    expect(decoded).toContainEqual(expect.objectContaining({ kind: 'parse-error' }))
    expect(decoded).toContainEqual({ kind: 'event', event: { type: 'response.output_text.delta', delta: 'valid-after-error' } })
    expect(decoded).toContainEqual({ kind: 'event', event: { type: 'response.completed', response: { id: 'r2' } } })
  })
})
