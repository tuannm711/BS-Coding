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
    expect(codexAuthorizeUrl(pkce)).toContain(`client_id=${CODEX_CLIENT_ID}`)
    expect(codexAuthorizeUrl(pkce)).toContain('code_challenge_method=S256')
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
