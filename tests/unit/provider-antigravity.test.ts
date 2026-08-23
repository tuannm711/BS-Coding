import { describe, expect, it } from 'vitest'
import { antigravityAuthorizeUrl, exchangeAntigravityCode } from '../../src/main/providers/auth/antigravity-oauth'

describe('Antigravity OAuth', () => {
  it('builds Google authorization URL with offline consent and required scopes', () => {
    const url = new URL(antigravityAuthorizeUrl('state-1'))
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('scope')).toContain('cloud-platform')
  })

  it('exchanges authorization code without exposing response bodies in errors', async () => {
    const tokens = await exchangeAntigravityCode('code', async () => new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } }) as typeof fetch)
    expect(tokens.accessToken).toBe('a')
    expect(tokens.refreshToken).toBe('r')
    await expect(exchangeAntigravityCode('bad', async () => new Response('secret error body', { status: 400 }) as typeof fetch)).rejects.toThrow('400')
  })
})
