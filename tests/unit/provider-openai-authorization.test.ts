import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeJwtProfile } from '../../src/main/connections/codex'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'

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

    const built = adapter.authorization!.build({
      pkce,
      callbackUrl: 'http://127.0.0.1:1455/auth/callback'
    })
    const result = await adapter.authorization!.complete({
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

    await adapter.authorization!.afterPersist?.({
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
  it('reads the account and organization ids from the auth claim', () => {
    const claim = { email: 'a@b.c', 'https://api.openai.com/auth': { account_id: 'acct-1', organization_id: 'org-1' } }
    const token = `x.${Buffer.from(JSON.stringify(claim)).toString('base64url')}.y`
    expect(decodeJwtProfile(token)).toMatchObject({ email: 'a@b.c', accountId: 'acct-1', organizationId: 'org-1' })
  })

  it('returns nothing for a malformed token', () => {
    expect(decodeJwtProfile('not-a-jwt')).toEqual({})
    expect(decodeJwtProfile(undefined)).toEqual({})
  })
})
