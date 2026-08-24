import type { ProviderSecrets } from '../../connections/types'

export const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com'
export const ANTIGRAVITY_CLIENT_SECRET = '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'
export const ANTIGRAVITY_REDIRECT_URI = 'http://localhost:1457/auth/callback'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const SCOPES = ['openid', 'https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/cclog', 'https://www.googleapis.com/auth/experimentsandconfigs']

export interface AntigravityTokens extends ProviderSecrets {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function antigravityAuthorizeUrl(pkce: { state: string; challenge: string }): string {
  const params = new URLSearchParams({ client_id: ANTIGRAVITY_CLIENT_ID, redirect_uri: ANTIGRAVITY_REDIRECT_URI, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state: pkce.state, code_challenge: pkce.challenge, code_challenge_method: 'S256' })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeAntigravityCode(code: string, verifier: string, fetchImpl: typeof fetch = fetch): Promise<AntigravityTokens> {
  const response = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: ANTIGRAVITY_CLIENT_ID, client_secret: ANTIGRAVITY_CLIENT_SECRET, code, redirect_uri: ANTIGRAVITY_REDIRECT_URI, grant_type: 'authorization_code', code_verifier: verifier }).toString() })
  if (!response.ok) throw new Error(`[bs] Antigravity OAuth token exchange failed (${response.status})`)
  const body = await response.json() as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number }
  if (!body.access_token || !body.refresh_token) throw new Error('[bs] Antigravity OAuth không trả về refresh token; hãy thu hồi quyền và đăng nhập lại')
  return { accessToken: body.access_token, refreshToken: body.refresh_token, idToken: body.id_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
}

export async function fetchAntigravityProfile(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<{ email?: string; name?: string }> {
  const response = await fetchImpl(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error(`[bs] Không lấy được Antigravity profile (${response.status})`)
  const body = await response.json() as { email?: string; name?: string }
  return { email: body.email, name: body.name }
}

export async function refreshAntigravityToken(refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<AntigravityTokens> {
  const response = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: ANTIGRAVITY_CLIENT_ID, client_secret: ANTIGRAVITY_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }).toString() })
  if (!response.ok) throw new Error(`[bs] Antigravity token refresh failed (${response.status})`)
  const body = await response.json() as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('[bs] Antigravity token refresh không trả về access token')
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? refreshToken, idToken: body.id_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
}
