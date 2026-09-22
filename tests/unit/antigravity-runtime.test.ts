import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ModelMessage } from 'ai'
import { createAntigravityLlm } from '../../src/main/agent/antigravity-llm'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import {
  ANTIGRAVITY_ENTITY_404
} from '../fixtures/provider-chat-fixtures'

function runtimeManager(dir: string) {
  const secrets = new Map<string, any>()
  const vault = {
    saveSecret: (ref: string, value: any) => secrets.set(ref, value),
    getSecret: (ref: string) => secrets.get(ref) ?? null,
    deleteSecret: (ref: string) => secrets.delete(ref)
  }
  const registry = new ProviderRegistry()
  registry.register(createAntigravityAdapter())
  const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: vault as never })
  manager.store.upsert({
    id: 'account-1', providerId: 'antigravity', label: 'Pro fixture', authMode: 'oauth', status: 'active', createdAt: 1, lastUsedAt: 1,
    models: ['claude-sonnet-4-6'],
    modelCatalog: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', runtimeId: 'MODEL_OLD' }]
  }, { accessToken: 'old-token', refreshToken: 'refresh-token', expiresAt: Date.now() + 3_600_000, projectId: 'stale-project' })
  return manager
}

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

  it('refreshes the project once while preserving the exact friendly model id after NOT_FOUND', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-antigravity-recovery-'))
    try {
      const requests: any[] = []
      const calls: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(url)
        if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'fresh-token', expires_in: 3600 }), { status: 200 })
        if (url.includes('loadCodeAssist')) return new Response(JSON.stringify({ cloudaicompanionProject: 'fresh-project', paidTier: { id: 'PRO' } }), { status: 200 })
        if (url.includes('fetchAvailableModels')) return new Response(JSON.stringify({ models: { MODEL_FRESH: { model: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' } } }), { status: 200 })
        requests.push(JSON.parse(String(init?.body)))
        if (requests.length === 1) return new Response(JSON.stringify(ANTIGRAVITY_ENTITY_404), { status: 404 })
        return new Response('data: {"response":{"candidates":[{"content":{"parts":[{"text":"recovered"}]},"finishReason":"STOP"}]}}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }))
      const manager = runtimeManager(dir)
      const parts = []
      for await (const part of manager.createRuntime('antigravity', 'account-1', 'claude-sonnet-4-6').stream({ model: 'claude-sonnet-4-6', system: '', messages: [{ role: 'user', content: 'hello' }], tools: [] })) parts.push(part)

      expect(requests).toHaveLength(2)
      expect(requests[0]).toMatchObject({ project: 'stale-project', model: 'claude-sonnet-4-6' })
      expect(requests[1]).toMatchObject({ project: 'fresh-project', model: 'claude-sonnet-4-6' })
      expect(calls.filter(url => url.includes('loadCodeAssist'))).toHaveLength(1)
      expect(calls.filter(url => url.includes('fetchAvailableModels'))).toHaveLength(1)
      expect(parts).toContainEqual({ kind: 'text', text: 'recovered' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stops after one runtime context recovery when NOT_FOUND repeats', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-antigravity-retry-bound-'))
    try {
      const calls: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        calls.push(url)
        if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'fresh-token', expires_in: 3600 }), { status: 200 })
        if (url.includes('loadCodeAssist')) return new Response(JSON.stringify({ cloudaicompanionProject: 'fresh-project' }), { status: 200 })
        if (url.includes('fetchAvailableModels')) return new Response(JSON.stringify({ models: { MODEL_FRESH: { model: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' } } }), { status: 200 })
        return new Response(JSON.stringify(ANTIGRAVITY_ENTITY_404), { status: 404 })
      }))
      const manager = runtimeManager(dir)
      const parts = []
      for await (const part of manager.createRuntime('antigravity', 'account-1', 'claude-sonnet-4-6').stream({ model: 'claude-sonnet-4-6', system: '', messages: [], tools: [] })) parts.push(part)

      expect(calls.filter(url => url.includes('streamGenerateContent'))).toHaveLength(2)
      expect(calls.filter(url => url.includes('loadCodeAssist'))).toHaveLength(1)
      expect(parts.filter(part => part.kind === 'error')).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports malformed Cloud Code frames and continues parsing later valid frames', async () => {
    const stream = [
      'event: result\ndata: {broken\n\n',
      'event: result\ndata: {"response":{"candidates":[{"content":{"parts":[{"text":"valid-after-error"}]},"finishReason":"STOP"}]}}\n\n'
    ].join('')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })))
    const parts = []
    for await (const part of createAntigravityLlm('token').stream({ model: 'gemini-3.1-pro-high', system: '', messages: [], tools: [] })) parts.push(part)
    expect(parts).toContainEqual(expect.objectContaining({ kind: 'error', error: expect.stringContaining('stream-invalid') }))
    expect(parts).toContainEqual({ kind: 'text', text: 'valid-after-error' })
  })
})
