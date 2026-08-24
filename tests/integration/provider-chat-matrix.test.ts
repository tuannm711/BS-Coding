import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelMessage } from 'ai'
import { OpenAIResponsesClient } from '../../src/main/agent/openai-responses'
import { createAntigravityLlm } from '../../src/main/agent/antigravity-llm'
import { createLlm, type LlmClient, type LlmStreamPart } from '../../src/main/agent/llm'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { createGitHubCopilotAdapter } from '../../src/main/providers/adapters/github-copilot'
import { createOpenAiCompatibleAdapter } from '../../src/main/providers/adapters/openai-compatible'
import {
  ANTIGRAVITY_ENTITY_404,
  CLOUD_CODE_TEXT_SSE,
  MISLABELED_SSE,
  OPENAI_COMPATIBLE_TEXT_SSE,
  OPENAI_COMPLETED,
  chunkedResponse
} from '../fixtures/provider-chat-fixtures'

const continuation: ModelMessage[] = [
  { role: 'user', content: [{ type: 'text', text: 'inspect' }] },
  { role: 'assistant', content: [
    { type: 'text', text: 'reading' },
    { type: 'tool-call', toolCallId: 'call-1', toolName: 'read', input: { file_path: 'a.ts' } }
  ] },
  { role: 'tool', content: [
    { type: 'tool-result', toolCallId: 'call-1', toolName: 'read', output: { type: 'text', value: 'contents' } }
  ] }
]

async function consume(client: LlmClient, model: string, messages: ModelMessage[]): Promise<LlmStreamPart[]> {
  const parts: LlmStreamPart[] = []
  for await (const part of client.stream({ model, system: 'You code.', messages, tools: [] })) parts.push(part)
  return parts
}

describe('provider chat transport matrix', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['openai-api', 'gpt-5.6-codex', 'openai-responses'],
    ['openai-oauth', 'gpt-5.6-codex', 'openai-responses'],
    ['github-copilot-oauth', 'claude-sonnet-4.6', 'openai-compatible'],
    ['openai-compatible', 'fixture-code', 'openai-compatible'],
    ['antigravity-gemini', 'gemini-3.1-pro-high', 'cloud-code'],
    ['antigravity-claude-gpt', 'claude-sonnet-4-6', 'cloud-code']
  ] as const)('%s completes text and tool-history continuation with the exact model', async (_name, model, transport) => {
    const bodies: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      if (transport === 'openai-responses') return new Response(JSON.stringify(OPENAI_COMPLETED), { status: 200, headers: { 'content-type': 'application/json' } })
      if (transport === 'cloud-code') return chunkedResponse([CLOUD_CODE_TEXT_SSE])
      return chunkedResponse([OPENAI_COMPATIBLE_TEXT_SSE])
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = transport === 'openai-responses'
      ? new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl: fetchMock as unknown as typeof fetch })
      : transport === 'cloud-code'
        ? createAntigravityLlm('fixture-token', { projectId: 'fixture-project', modelId: model })
        : createLlm('openai-compatible', 'fixture-token', 'https://provider.invalid/v1')

    const textParts = await consume(client, model, [{ role: 'user', content: 'hello' }])
    const continuationParts = await consume(client, model, continuation)

    expect(textParts.some(part => part.kind === 'text')).toBe(true)
    expect(continuationParts.some(part => part.kind === 'text')).toBe(true)
    expect(bodies).toHaveLength(2)
    expect(bodies.every(body => body.model === model)).toBe(true)
  })

  it('covers every provider adapter registered by the desktop app', () => {
    const registry = new ProviderRegistry()
    registry.register(createOpenAiAdapter())
    registry.register(createGitHubCopilotAdapter())
    registry.register(createAntigravityAdapter())
    for (const [id, label] of [
      ['cursor', 'Cursor'], ['windsurf', 'Windsurf'], ['kiro', 'Kiro'], ['grok', 'Grok / xAI'],
      ['codebuddy', 'CodeBuddy'], ['codebuddy-cn', 'CodeBuddy CN'], ['qoder', 'Qoder'], ['trae', 'Trae'],
      ['zed', 'Zed'], ['zcode', 'ZCode']
    ] as const) registry.register(createOpenAiCompatibleAdapter(id, label, id === 'grok'))

    const tested = new Set(['openai', 'github-copilot', 'antigravity', 'cursor', 'windsurf', 'kiro', 'grok', 'codebuddy', 'codebuddy-cn', 'qoder', 'trae', 'zed', 'zcode'])
    expect(registry.listReady().map(provider => provider.id).filter(id => !tested.has(id))).toEqual([])
  })

  it('rejects raw AI SDK tool content before an OpenAI Responses request is sent', async () => {
    let body: any
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(OPENAI_COMPLETED), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await consume(new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl }), 'gpt-5.6-codex', continuation)
    expect(JSON.stringify(body.input)).not.toContain('"type":"tool-call"')
    expect(JSON.stringify(body.input)).not.toContain('"type":"tool-result"')
  })

  it('treats an event/data body as SSE even when the upstream content type is wrong', async () => {
    const fetchImpl = vi.fn(async () => new Response(MISLABELED_SSE, { status: 200, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch
    const parts = await consume(new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl }), 'gpt-5.6-codex', [])
    expect(parts).toContainEqual({ kind: 'text', text: 'recovered' })
  })

  it('surfaces Antigravity NOT_FOUND as refreshable runtime context', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(ANTIGRAVITY_ENTITY_404), { status: 404 })))
    const parts = await consume(createAntigravityLlm('fixture-token', { projectId: 'stale-project', modelId: 'MODEL_OLD' }), 'claude-sonnet-4-6', [])
    expect(parts).toContainEqual(expect.objectContaining({ kind: 'error', error: expect.stringContaining('runtime-entity-not-found') }))
  })
})
