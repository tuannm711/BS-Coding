import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'
import { createFixtureAdapter } from '../../src/main/providers/adapters/fixture'

describe('provider adapter contract', () => {
  afterEach(() => vi.unstubAllGlobals())
  it.each([
    ['openai', createOpenAiAdapter()],
    ['antigravity', createAntigravityAdapter()],
    ['fixture', createFixtureAdapter()]
  ])('%s exposes definition, refresh, models and runtime boundaries', async (id, adapter) => {
    expect(adapter.definition().id).toBe(id)
    const account = { id: 'a1', providerId: id, label: id, authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }
    expect(await adapter.refreshAccount(account, {})).toEqual(account)
    expect(typeof adapter.createRuntime).toBe('function')
    expect(typeof adapter.listModels).toBe('function')
  })

  it('routes OpenAI OAuth through ChatGPT Codex headers instead of the API-key endpoint', async () => {
    let calledUrl = ''
    let calledHeaders: Record<string, string> = {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calledUrl = url
      calledHeaders = init?.headers as Record<string, string>
      const body = `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'r1', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } })}\n\n`
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close() } }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }))
    const account = { id: 'a1', providerId: 'openai', label: 'Plus', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }
    const runtime = createOpenAiAdapter().createRuntime(account, { accessToken: 'oauth-token', accountId: 'chatgpt-account' }, { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' })
    for await (const _part of runtime.stream({ model: 'gpt-5.6-sol', system: '', messages: [{ role: 'user', content: 'hi' }], tools: [] })) { /* consume */ }
    expect(calledUrl).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(calledHeaders.authorization).toBe('Bearer oauth-token')
    expect(calledHeaders['ChatGPT-Account-ID']).toBe('chatgpt-account')
    expect(calledHeaders.originator).toBe('codex_vscode')
  })

  it('keeps provider-specific OAuth and header logic out of BsAgentManager', () => {
    const source = readFileSync(path.resolve(__dirname, '../../src/main/bs-agent-manager.ts'), 'utf-8')
    expect(source).not.toContain('oauthHeaders(')
    expect(source).not.toContain('applyAccountCredentials(')
    expect(source).not.toContain("account.providerId === 'openai'")
  })

  it('keeps provider-specific authorization branches out of ProviderManager', () => {
    const source = readFileSync(path.resolve(__dirname, '../../src/main/connections/manager.ts'), 'utf-8')
    expect(source).not.toContain("request.providerId === 'openai'")
    expect(source).not.toContain("request.providerId === 'antigravity'")
    expect(source).not.toContain("providerId === 'antigravity'")
  })

  it('reports Antigravity discovery failure instead of replacing the remote catalog with static models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('temporarily unavailable', { status: 503 })))
    const account = { id: 'a1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth' as const, status: 'active' as const, models: ['remote-code-model'], createdAt: 1, lastUsedAt: 1 }

    await expect(createAntigravityAdapter().listModels(account, { accessToken: 'token' })).rejects.toThrow(/503/)
  })

  it('resolves Antigravity project and tier before model discovery', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) })
      if (url.endsWith('v1internal:loadCodeAssist')) return new Response(JSON.stringify({ cloudaicompanionProject: 'project-123', paidTier: { id: 'PRO' } }), { status: 200 })
      return new Response(JSON.stringify({ models: { 'gemini-3.6-flash-medium': { model: 'MODEL_PLACEHOLDER_M72', displayName: 'Gemini 3.6 Flash (Medium)', quotaInfo: { remainingFraction: 0.75 } } } }), { status: 200 })
    }))
    const account = { id: 'a1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }
    const secret = { accessToken: 'token' }

    const models = await createAntigravityAdapter().listModels(account, secret)

    expect(calls.map(call => call.url)).toEqual([
      'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
      'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels'
    ])
    expect(calls[1].body).toEqual({ project: 'project-123' })
    expect(secret).toMatchObject({ projectId: 'project-123', planName: 'PRO' })
    expect(models[0]).toMatchObject({ id: 'gemini-3.6-flash-medium', runtimeId: 'MODEL_PLACEHOLDER_M72', name: 'Gemini 3.6 Flash (Medium)' })
  })

  it.each([
    ['openai', createOpenAiAdapter(), 'https://auth.openai.com/oauth/token'],
    ['antigravity', createAntigravityAdapter(), 'https://oauth2.googleapis.com/token']
  ])('refreshes expired %s OAuth credentials through its own adapter', async (_id, adapter, tokenUrl) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe(tokenUrl)
      return new Response(JSON.stringify({ access_token: 'rotated-token', refresh_token: 'rotated-refresh', expires_in: 3600 }), { status: 200 })
    }))
    const account = { id: 'a1', providerId: adapter.capability.id, label: 'OAuth', authMode: 'oauth' as const, status: 'active' as const, oauthExpiresAt: 1, createdAt: 1, lastUsedAt: 1 }

    const rotated = await adapter.refreshCredentials!(account, { accessToken: 'expired-token', refreshToken: 'refresh-token', expiresAt: 1 })

    expect(rotated).toMatchObject({ accessToken: 'rotated-token', refreshToken: 'rotated-refresh' })
  })

  it('refreshes ChatGPT OAuth once when usage endpoints reject a still-unexpired token', async () => {
    const authHeaders: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://auth.openai.com/oauth/token') return new Response(JSON.stringify({ access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }), { status: 200 })
      const authorization = (init?.headers as Record<string, string> | undefined)?.authorization ?? ''
      authHeaders.push(authorization)
      if (authorization === 'Bearer old-token') return new Response('', { status: 401 })
      return new Response(JSON.stringify({ plan_type: 'plus', rate_limit: { primary_window: { used_percent: 10 } } }), { status: 200 })
    }))
    const account = { id: 'a1', providerId: 'openai', label: 'Plus', authMode: 'oauth' as const, status: 'active' as const, oauthExpiresAt: Date.now() + 3_600_000, createdAt: 1, lastUsedAt: 1 }
    const secret = { accessToken: 'old-token', refreshToken: 'refresh', expiresAt: Date.now() + 3_600_000 }

    const usage = await createOpenAiAdapter().fetchUsage!(account, secret)

    expect(usage).toMatchObject({ status: 'ok', planName: 'plus' })
    expect(secret).toMatchObject({ accessToken: 'new-token', refreshToken: 'new-refresh' })
    expect(authHeaders).toContain('Bearer new-token')
  })
})
