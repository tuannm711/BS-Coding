import { afterEach, describe, expect, it, vi } from 'vitest'
import { antigravityAuthorizeUrl, exchangeAntigravityCode } from '../../src/main/providers/auth/antigravity-oauth'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'

describe('Antigravity OAuth', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('builds Google authorization URL with offline consent and required scopes', () => {
    const url = new URL(antigravityAuthorizeUrl({ state: 'state-1', challenge: 'challenge-1' }))
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toContain('cloud-platform')
  })

  it('exchanges authorization code without exposing response bodies in errors', async () => {
    let body = ''
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      body = String(init?.body ?? '')
      return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const tokens = await exchangeAntigravityCode('code', 'verifier-1', fetchImpl as typeof fetch)
    expect(tokens.accessToken).toBe('a')
    expect(tokens.refreshToken).toBe('r')
    expect(new URLSearchParams(body).get('code_verifier')).toBe('verifier-1')
    await expect(exchangeAntigravityCode('bad', 'verifier-1', (async () => new Response('secret error body', { status: 400 })) as unknown as typeof fetch)).rejects.toThrow('400')
  })

  it('normalizes an Antigravity OAuth account through its adapter strategy', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/token')
      ? new Response(JSON.stringify({ access_token: 'ya29', refresh_token: 'refresh', expires_in: 3_600 }), { status: 200 })
      : new Response(JSON.stringify({ email: 'pro@example.com', name: 'Pro User' }), { status: 200 })))
    const adapter = createAntigravityAdapter()

    const built = adapter.authorization!.build({
      pkce: { verifier: 'verifier', challenge: 'challenge', state: 'state-value' },
      callbackUrl: 'http://127.0.0.1:1457/auth/callback'
    })
    const result = await adapter.authorization!.complete({
      code: 'code',
      verifier: 'verifier',
      callbackUrl: 'http://127.0.0.1:1457/auth/callback'
    })

    expect(built.expectedState).toBe('state-value')
    expect(result.account).toMatchObject({
      providerId: 'antigravity',
      label: 'pro@example.com',
      authMode: 'oauth',
      status: 'active'
    })
    expect(result.secrets).toMatchObject({ accessToken: 'ya29', refreshToken: 'refresh' })
  })

  it('uses the persisted friendly model id for Cloud Code generation, not the catalog model constant', async () => {
    let requestBody: any
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response('data: {"response":{"candidates":[{"finishReason":"STOP"}]}}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }))
    const adapter = createAntigravityAdapter()
    const account = { id: 'a1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }
    const runtime = adapter.createRuntime(account, { accessToken: 'token', projectId: 'project-1' }, {
      id: 'claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      runtimeId: 'MODEL_PLACEHOLDER_M35'
    })
    for await (const _part of runtime.stream({ model: 'claude-sonnet-4-6', system: '', messages: [{ role: 'user', content: 'hello' }], tools: [] })) { /* consume */ }
    expect(requestBody).toMatchObject({ project: 'project-1', model: 'claude-sonnet-4-6' })
  })
})
