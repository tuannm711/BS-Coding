import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeJwtProfile } from '../../src/main/connections/codex'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'
import type { ProviderCallbackAuthorizationStrategy } from '../../src/main/providers/types'

vi.mock('../../src/main/agent/llm', () => ({ createLlm: vi.fn(() => ({})) }))
import { createLlm } from '../../src/main/agent/llm'

const callbackAuth = (adapter: ReturnType<typeof createOpenAiAdapter>) =>
  adapter.authorization as ProviderCallbackAuthorizationStrategy

const installedCodex = async () => ({ installed: true, version: '0.155.0', userAgent: 'codex_cli/0.155.0', originator: 'codex_cli' })

const pkce = { verifier: 'verifier', challenge: 'challenge', state: 'state-value' }

function jwt(payload: Record<string, unknown>): string {
  return `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`
}

describe('OpenAI provider authorization', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('builds and completes ChatGPT authorization in the adapter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      access_token: 'access',
      refresh_token: 'refresh',
      id_token: jwt({ email: 'plus@example.com', name: 'Plus User' }),
      expires_in: 3_600
    }), { status: 200 })))
    const adapter = createOpenAiAdapter()

    const built = callbackAuth(adapter).build({
      pkce,
      callbackUrl: 'http://127.0.0.1:1455/auth/callback'
    })
    const result = await callbackAuth(adapter).complete({
      code: 'oauth-code',
      verifier: pkce.verifier,
      callbackUrl: 'http://127.0.0.1:1455/auth/callback'
    })

    expect(new URL(built.authUrl).searchParams.get('state')).toBe(pkce.state)
    expect(built.expectedState).toBe(pkce.state)
    expect(result.account).toMatchObject({
      providerId: 'openai',
      label: 'plus@example.com',
      authMode: 'oauth',
      status: 'active'
    })
    expect(result.secrets).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' })
  })

  it('writes the Codex auth file only after account persistence', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-openai-auth-'))
    const authFile = path.join(dir, 'auth.json')
    const adapter = createOpenAiAdapter({ codexAuthFile: authFile })
    const secrets = { accessToken: 'access', refreshToken: 'refresh', idToken: 'id', accountId: 'acct-1' }

    await callbackAuth(adapter).afterPersist?.({
      id: 'provider-account',
      providerId: 'openai',
      label: 'Plus',
      authMode: 'oauth',
      status: 'active',
      createdAt: 1,
      lastUsedAt: 1
    }, secrets)

    const saved = JSON.parse(readFileSync(authFile, 'utf8'))
    expect(saved.tokens).toMatchObject({ access_token: 'access', refresh_token: 'refresh', account_id: 'acct-1' })
  })
})

describe('ChatGPT id_token claims', () => {
  it('reads the chatgpt-prefixed identifiers and subscription window from the auth claim', () => {
    const claim = { email: 'a@b.c', 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1', chatgpt_plan_type: 'plus', chatgpt_subscription_active_until: '2026-09-18T05:47:59+00:00' } }
    const token = `x.${Buffer.from(JSON.stringify(claim)).toString('base64url')}.y`
    expect(decodeJwtProfile(token)).toMatchObject({
      email: 'a@b.c',
      accountId: 'acct-1',
      planName: 'plus',
      subscriptionExpiresAt: Date.parse('2026-09-18T05:47:59+00:00')
    })
  })

  it('ignores an auth claim that carries no subscription window', () => {
    const claim = { 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-2' } }
    const token = `x.${Buffer.from(JSON.stringify(claim)).toString('base64url')}.y`
    const profile = decodeJwtProfile(token)
    expect(profile.accountId).toBe('acct-2')
    expect(profile.subscriptionExpiresAt).toBeUndefined()
  })

  it('returns nothing for a malformed token', () => {
    expect(decodeJwtProfile('not-a-jwt')).toEqual({})
    expect(decodeJwtProfile(undefined)).toEqual({})
  })
})

describe('OpenAI subscription gate and borrowed identity', () => {
  it('hides the oauth method until an installed Codex CLI is detected', async () => {
    const adapter = createOpenAiAdapter({ detectIdentity: async () => ({ installed: false }) })
    await adapter.ready
    expect(adapter.capability.methods.find(m => m.id === 'oauth')).toBeUndefined()
    expect(adapter.capability.methods.find(m => m.id === 'api-key')).toBeDefined()
  })

  it('exposes the oauth method when Codex CLI is installed', async () => {
    const adapter = createOpenAiAdapter({ detectIdentity: installedCodex })
    await adapter.ready
    expect(adapter.capability.methods.find(m => m.id === 'oauth')).toBeDefined()
  })

  it('uses the borrowed identity (not hardcoded codex_vscode) for oauth runtime headers', async () => {
    const createLlmMock = vi.mocked(createLlm)
    createLlmMock.mockClear()
    const adapter = createOpenAiAdapter({ detectIdentity: installedCodex })
    await adapter.ready
    adapter.createRuntime({ authMode: 'oauth' } as never, { accessToken: 't' } as never, {} as never)
    const headers = createLlmMock.mock.calls.at(-1)?.[3] as Record<string, string>
    expect(headers['user-agent']).toBe('codex_cli/0.155.0')
    expect(headers['originator']).toBe('codex_cli')
    expect(headers['user-agent']).not.toContain('codex_vscode')
  })

  it('keeps tool-calling enabled for oauth and api-key models', async () => {
    const adapter = createOpenAiAdapter({ detectIdentity: installedCodex })
    const oauthModels = await adapter.listModels({ authMode: 'oauth' } as never, {} as never)
    const apiModels = await adapter.listModels({ authMode: 'api-key' } as never, {} as never)
    expect(oauthModels.every(m => m.capabilities?.supportsTools)).toBe(true)
    expect(apiModels.every(m => m.capabilities?.supportsTools)).toBe(true)
  })
})
