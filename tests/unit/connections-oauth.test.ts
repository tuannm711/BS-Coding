import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createPkce } from '../../src/main/connections/oauth'
import { CODEX_CLIENT_ID, codexAuthorizeUrl, decodeJwtProfile, mergeCodexAuthFile } from '../../src/main/connections/codex'

describe('OAuth helpers', () => {
  it('creates a URL-safe PKCE challenge and state', () => {
    const pkce = createPkce()
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43)
    expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    const url = new URL(codexAuthorizeUrl(pkce))
    expect(url.searchParams.get('client_id')).toBe(CODEX_CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:1455/auth/callback')
    expect(url.searchParams.get('scope')).toBe('openid profile email offline_access')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('id_token_add_organizations')).toBe('true')
    expect(url.searchParams.get('codex_cli_simplified_flow')).toBe('true')
    expect(url.searchParams.get('originator')).toBe('codex_vscode')
  })

  it('extracts account metadata from an id token', () => {
    const payload = Buffer.from(JSON.stringify({ email: 'a@example.com', name: 'A', 'https://api.openai.com/auth': { account_id: 'acct-1' } })).toString('base64url')
    expect(decodeJwtProfile(`x.${payload}.y`)).toEqual({ email: 'a@example.com', name: 'A', accountId: 'acct-1' })
  })

  it('merges Codex auth and preserves unrelated fields', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-codex-'))
    const file = path.join(dir, 'auth.json')
    writeFileSync(file, JSON.stringify({ custom: true, tokens: { old: 'x' } }))
    mergeCodexAuthFile(file, { accessToken: 'a', refreshToken: 'r', idToken: 'i', accountId: 'acct' })
    const next = JSON.parse(readFileSync(file, 'utf8'))
    expect(next.custom).toBe(true)
    expect(next.tokens.access_token).toBe('a')
    expect(next.tokens.old).toBe('x')
  })
})
