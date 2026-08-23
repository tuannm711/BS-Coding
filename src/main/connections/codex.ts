import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import type { ProviderSecrets } from './types'

export const CODEX_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
export const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token'
export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CODEX_REDIRECT_URI = 'http://localhost:1455/auth/callback'
export const CODEX_ORIGINATOR = 'codex_vscode'

export interface CodexTokens extends ProviderSecrets {
  accessToken: string
  refreshToken: string
  idToken?: string
  accountId?: string
  expiresAt?: number
}

export function codexAuthorizeUrl(pkce: { challenge: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: CODEX_CLIENT_ID,
    response_type: 'code',
    redirect_uri: CODEX_REDIRECT_URI,
    scope: 'openid profile email offline_access',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state: pkce.state,
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: CODEX_ORIGINATOR
  })
  return `${CODEX_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCodexCode(code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<CodexTokens> {
  const response = await fetchImpl(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', originator: CODEX_ORIGINATOR, 'user-agent': `${CODEX_ORIGINATOR}/0.146.0` },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CODEX_CLIENT_ID, code, redirect_uri: CODEX_REDIRECT_URI, code_verifier: verifier }).toString()
  })
  if (!response.ok) throw new Error(`[bs] Đổi mã OAuth thất bại (${response.status})`)
  const body = await response.json() as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number }
  if (!body.access_token || !body.refresh_token) throw new Error('[bs] OAuth không trả về đủ token')
  return { accessToken: body.access_token, refreshToken: body.refresh_token, idToken: body.id_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
}

export function decodeJwtProfile(idToken?: string): { email?: string; name?: string; accountId?: string } {
  if (!idToken) return {}
  try {
    const payload = idToken.split('.')[1]
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
    const auth = parsed['https://api.openai.com/auth'] as Record<string, unknown> | undefined
    return {
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      accountId: typeof auth?.account_id === 'string' ? auth.account_id : undefined
    }
  } catch {
    return {}
  }
}

export function mergeCodexAuthFile(file: string, tokens: CodexTokens, backupFile?: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
  if (existsSync(file) && backupFile && !existsSync(backupFile)) {
    mkdirSync(path.dirname(backupFile), { recursive: true })
    copyFileSync(file, backupFile)
  }
  let current: Record<string, unknown> = {}
  if (existsSync(file)) {
    try { current = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> } catch { current = {} }
  }
  const next = {
    ...current,
    auth_mode: 'oauth',
    OPENAI_API_KEY: null,
    tokens: {
      ...(typeof current.tokens === 'object' && current.tokens !== null ? current.tokens as Record<string, unknown> : {}),
      id_token: tokens.idToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      account_id: tokens.accountId
    },
    last_refresh: Date.now()
  }
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, JSON.stringify(next, null, 2))
  renameSync(temp, file)
}
