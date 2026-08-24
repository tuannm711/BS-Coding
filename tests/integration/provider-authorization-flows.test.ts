import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'

function fakeVault() {
  const secrets = new Map<string, string>()
  return {
    saveSecret: (ref: string, value: string) => secrets.set(ref, value),
    getSecret: (ref: string) => secrets.get(ref) ?? null,
    deleteSecret: (ref: string) => secrets.delete(ref)
  }
}

function jwt(payload: Record<string, unknown>): string {
  return `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`
}

describe('provider authorization full flows', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates and completes an OpenAI link without exposing or automatically opening it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === 'https://auth.openai.com/oauth/token') {
        return new Response(JSON.stringify({
          access_token: 'openai-access',
          refresh_token: 'openai-refresh',
          id_token: jwt({ email: 'plus@example.com', 'https://api.openai.com/auth': { account_id: 'chatgpt-account' } }),
          expires_in: 3_600
        }), { status: 200 })
      }
      throw new Error(`Unexpected URL ${url}`)
    }))
    const registry = new ProviderRegistry()
    registry.register(createOpenAiAdapter())
    const openExternal = vi.fn()
    const manager = new ProviderManager({
      accountsFile: path.join(mkdtempSync(path.join(tmpdir(), 'bs-openai-flow-')), 'accounts.json'),
      registry,
      vault: fakeVault() as never,
      openExternal
    })

    const session = await manager.createAuthorization({ providerId: 'openai', methodId: 'oauth' })
    expect(openExternal).not.toHaveBeenCalled()
    expect(JSON.stringify(session)).not.toMatch(/verifier|accessToken|refreshToken/)

    const auth = new URL(session.authUrl)
    get(`http://127.0.0.1:1455/auth/callback?code=oauth-code&state=${encodeURIComponent(auth.searchParams.get('state') ?? '')}`).on('error', () => {})
    await vi.waitFor(() => expect(manager.getAuthorization(session.loginId)?.status).toBe('connected'))

    const account = manager.list('openai')[0].accounts[0]
    expect(account).toMatchObject({ label: 'plus@example.com', authMode: 'oauth', status: 'active' })
    expect(account.models).toContain('gpt-5.6-sol')
    expect(manager.store.getSecret(account.id)).toMatchObject({ accessToken: 'openai-access', refreshToken: 'openai-refresh' })
    manager.close()
  })
})
