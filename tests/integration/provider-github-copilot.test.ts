import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createGitHubCopilotAdapter } from '../../src/main/providers/adapters/github-copilot'
import { OPENAI_COMPATIBLE_TEXT_SSE, chunkedResponse } from '../fixtures/provider-chat-fixtures'

function fakeVault() {
  const secrets = new Map<string, string>()
  return {
    saveSecret: (ref: string, value: string) => secrets.set(ref, value),
    getSecret: (ref: string) => secrets.get(ref) ?? null,
    deleteSecret: (ref: string) => secrets.delete(ref)
  }
}

function issueCallback(authUrl: string): void {
  const state = new URL(authUrl).searchParams.get('state')!
  const separator = state.includes('?') ? '&' : '?'
  get(`${state}${separator}code=oauth-code&state=${encodeURIComponent(state)}`).on('error', () => {})
}

describe('GitHub Copilot authorization integration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates, reconnects and hydrates one Copilot account', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/login/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'github-token' }), { status: 200 })
      if (url === 'https://api.github.com/user') return new Response(JSON.stringify({ id: 7, login: 'octocat', email: 'octo@example.com' }), { status: 200 })
      if (url.endsWith('/copilot_internal/v2/token')) return new Response(JSON.stringify({ token: 'copilot-token', expires_at: 2_000_000_000, chat_enabled: true }), { status: 200 })
      if (url.endsWith('/copilot_internal/user')) return new Response(JSON.stringify({ copilot_plan: 'pro' }), { status: 200 })
      throw new Error(`Unexpected URL ${url}`)
    }))
    const registry = new ProviderRegistry()
    registry.register(createGitHubCopilotAdapter())
    const manager = new ProviderManager({
      accountsFile: path.join(mkdtempSync(path.join(tmpdir(), 'bs-copilot-integration-')), 'accounts.json'),
      registry,
      vault: fakeVault() as never
    })

    const first = await manager.createAuthorization({ providerId: 'github-copilot', methodId: 'oauth' })
    issueCallback(first.authUrl)
    await vi.waitFor(() => expect(manager.getAuthorization(first.loginId)?.status).toBe('connected'))
    const account = manager.list('github-copilot')[0].accounts[0]
    expect(account.models).toEqual(['gpt-4.1', 'claude-sonnet-4'])
    expect(manager.store.getSecret(account.id)).toMatchObject({ githubAccessToken: 'github-token', accessToken: 'copilot-token' })

    const reconnect = await manager.createAuthorization({ providerId: 'github-copilot', methodId: 'oauth', reconnectAccountId: account.id })
    issueCallback(reconnect.authUrl)
    await vi.waitFor(() => expect(manager.getAuthorization(reconnect.loginId)?.status).toBe('connected'))
    expect(manager.list('github-copilot')[0].accounts).toHaveLength(1)
    expect(manager.list('github-copilot')[0].accounts[0].id).toBe(account.id)
    manager.close()
  })

  it('does not create an account when Copilot entitlement is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/login/oauth/access_token')) return new Response(JSON.stringify({ access_token: 'github-token' }), { status: 200 })
      if (url === 'https://api.github.com/user') return new Response(JSON.stringify({ id: 7, login: 'octocat', email: 'octo@example.com' }), { status: 200 })
      if (url.endsWith('/copilot_internal/v2/token')) return new Response('', { status: 403 })
      throw new Error(`Unexpected URL ${url}`)
    }))
    const registry = new ProviderRegistry()
    registry.register(createGitHubCopilotAdapter())
    const manager = new ProviderManager({
      accountsFile: path.join(mkdtempSync(path.join(tmpdir(), 'bs-copilot-no-entitlement-')), 'accounts.json'),
      registry,
      vault: fakeVault() as never
    })

    const session = await manager.createAuthorization({ providerId: 'github-copilot', methodId: 'oauth' })
    issueCallback(session.authUrl)
    await vi.waitFor(() => expect(manager.getAuthorization(session.loginId)?.status).toBe('error'))

    expect(manager.getAuthorization(session.loginId)?.error?.kind).toBe('entitlement-missing')
    expect(manager.list('github-copilot')).toEqual([])
    manager.close()
  })

  it('refreshes the Copilot runtime token once and preserves the exact Agent model', async () => {
    const requests: Array<{ body: any; authorization: string | null }> = []
    const tokenCalls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/copilot_internal/v2/token')) {
        tokenCalls.push(url)
        return new Response(JSON.stringify({ token: 'fresh-copilot-token', expires_at: 2_000_000_000, chat_enabled: true }), { status: 200 })
      }
      if (url.endsWith('/copilot_internal/user')) return new Response(JSON.stringify({ copilot_plan: 'pro' }), { status: 200 })
      if (url.includes('api.githubcopilot.com')) {
        requests.push({ body: JSON.parse(String(init?.body)), authorization: new Headers(init?.headers).get('authorization') })
        return chunkedResponse([OPENAI_COMPATIBLE_TEXT_SSE])
      }
      throw new Error(`Unexpected URL ${url}`)
    }))
    const registry = new ProviderRegistry()
    registry.register(createGitHubCopilotAdapter())
    const manager = new ProviderManager({
      accountsFile: path.join(mkdtempSync(path.join(tmpdir(), 'bs-copilot-runtime-')), 'accounts.json'),
      registry,
      vault: fakeVault() as never
    })
    manager.store.upsert({
      id: 'copilot-account', providerId: 'github-copilot', label: 'Copilot Pro', authMode: 'oauth', status: 'active', createdAt: 1, lastUsedAt: 1,
      models: ['claude-sonnet-4.6'],
      modelCatalog: [{ id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6' }]
    }, { githubAccessToken: 'github-identity-token', accessToken: 'expired-runtime-token', expiresAt: 1 })

    const parts = []
    for await (const part of manager.createRuntime('github-copilot', 'copilot-account', 'claude-sonnet-4.6').stream({
      model: 'claude-sonnet-4.6', system: '', messages: [{ role: 'user', content: 'hello' }], tools: []
    })) parts.push(part)

    expect(tokenCalls).toHaveLength(1)
    expect(requests).toHaveLength(1)
    expect(requests[0].body.model).toBe('claude-sonnet-4.6')
    expect(requests[0].authorization).toBe('Bearer fresh-copilot-token')
    expect(parts).toContainEqual({ kind: 'text', text: 'compatible text' })
    manager.close()
  })
})
