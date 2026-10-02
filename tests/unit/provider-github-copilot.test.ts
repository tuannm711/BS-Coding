import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copilotRuntimeCredential, createGitHubCopilotAdapter } from '../../src/main/providers/adapters/github-copilot'
import type { ProviderDeviceAuthorizationStrategy } from '../../src/main/providers/types'
import { copilotModelCatalog } from '../fixtures/copilot-model-catalog'

describe('GitHub Copilot adapter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('declares OAuth and token import without promoting unverified runtime', () => {
    const adapter = createGitHubCopilotAdapter()
    expect(adapter.capability.methods.map(method => method.id)).toEqual(['oauth', 'imported'])
    expect(adapter.capability.status).toBe('experimental')
  })

  it('imports a Copilot token and exposes coding models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(copilotModelCatalog)))
    const adapter = createGitHubCopilotAdapter()
    const result = await adapter.connect({ providerId: 'github-copilot', methodId: 'imported', fields: { credentialJson: JSON.stringify({ accessToken: 'token' }) } }, {
      saveAccount: (account, secret) => ({ ...account, id: 'copilot-1', createdAt: 1, lastUsedAt: 1, models: ['gpt-4.1'], keyRef: secret?.accessToken })
    })
    expect(result.account.id).toBe('copilot-1')
    expect((await adapter.listModels(result.account, { accessToken: 'token' }))[0].id).toBe('gpt-4.1')
  })

  it('exchanges GitHub identity for a Copilot entitlement and runtime token', async () => {
    const calls: Array<{ url: string; authorization?: string; body?: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      calls.push({ url, authorization: headers?.authorization, body: String(init?.body ?? '') })
      if (url.endsWith('/login/device/code')) return Response.json({ device_code: 'private-device', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
      if (url.endsWith('/login/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'github-token' }), { status: 200 })
      if (url === 'https://api.github.com/user') return new Response(JSON.stringify({ id: 7, login: 'octocat', name: 'Octo Cat', email: 'octo@example.com' }), { status: 200 })
      if (url.endsWith('/copilot_internal/v2/token')) return new Response(JSON.stringify({ token: 'copilot-token', expires_at: 2_000_000_000, sku: 'copilot_pro', chat_enabled: true }), { status: 200 })
      if (url.endsWith('/copilot_internal/user')) return new Response(JSON.stringify({ copilot_plan: 'pro' }), { status: 200 })
      throw new Error(`Unexpected URL ${url}`)
    }))
    const adapter = createGitHubCopilotAdapter()

    const device = await (adapter.authorization as ProviderDeviceAuthorizationStrategy).start({ signal: new AbortController().signal })
    const completion = device.complete()
    await vi.advanceTimersByTimeAsync(5000)
    const result = await completion

    expect(result.account).toMatchObject({ providerId: 'github-copilot', label: 'octo@example.com', authMode: 'oauth', status: 'active' })
    expect(result.secrets).toMatchObject({ githubAccessToken: 'github-token', accessToken: 'copilot-token', planName: 'pro' })
    expect(calls.find(call => call.url.endsWith('/login/oauth/access_token'))?.body).not.toContain('client_secret')
    expect(calls.find(call => call.url.endsWith('/user'))?.authorization).toBe('Bearer github-token')
    expect(calls.find(call => call.url.endsWith('/copilot_internal/v2/token'))?.authorization).toBe('token github-token')
  })

  it('rejects a GitHub account without a Copilot entitlement', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/login/device/code')) return Response.json({ device_code: 'private-device', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
      if (url.endsWith('/login/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'github-token' }), { status: 200 })
      if (url === 'https://api.github.com/user') return new Response(JSON.stringify({ id: 7, login: 'octocat', email: 'octo@example.com' }), { status: 200 })
      if (url.endsWith('/copilot_internal/v2/token')) return new Response(JSON.stringify({ message: 'no subscription' }), { status: 403 })
      throw new Error(`Unexpected URL ${url}`)
    }))
    const adapter = createGitHubCopilotAdapter()

    const device = await (adapter.authorization as ProviderDeviceAuthorizationStrategy).start({ signal: new AbortController().signal })
    const assertion = expect(device.complete()).rejects.toThrow(/entitlement/i)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('uses only a runtime token or imported API key for Copilot chat', () => {
    expect(copilotRuntimeCredential({ accessToken: 'copilot-runtime-token', githubAccessToken: 'github-identity-token' })).toBe('copilot-runtime-token')
    expect(copilotRuntimeCredential({ apiKey: 'imported-copilot-token' })).toBe('imported-copilot-token')
    expect(() => copilotRuntimeCredential({ githubAccessToken: 'github-identity-token' })).toThrow('[bs] GitHub Copilot runtime token unavailable')
  })
})
