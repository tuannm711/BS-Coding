import type { ProviderSecrets } from '../../connections/types'

const GITHUB_AUTHORIZATION_ENDPOINT = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_ENDPOINT = 'https://api.github.com/user'
const GITHUB_USER_EMAILS_ENDPOINT = 'https://api.github.com/user/emails'
const GITHUB_COPILOT_TOKEN_ENDPOINT = 'https://api.github.com/copilot_internal/v2/token'
const GITHUB_COPILOT_USER_ENDPOINT = 'https://api.github.com/copilot_internal/user'
const GITHUB_CLIENT_ID = '01ab8ac9400c4e429b23'
const GITHUB_REDIRECT_URI = 'https://vscode.dev/redirect'
const GITHUB_SCOPE = 'read:user repo user:email workflow'
const GITHUB_API_VERSION = '2025-04-01'
const USER_AGENT = 'bs-coding'

interface GitHubUser {
  id: number
  login: string
  name?: string
  email?: string
}

interface GitHubEmail {
  email: string
  primary?: boolean
  verified?: boolean
}

interface CopilotToken {
  token?: string
  expires_at?: number
  sku?: string
  chat_enabled?: boolean
}

interface CopilotUserInfo {
  copilot_plan?: string
}

export interface GitHubCopilotAuthorizationResult {
  profile: { login: string; name?: string; email?: string }
  secrets: ProviderSecrets
}

export function githubCopilotAuthorizeUrl(pkce: { challenge: string }, callbackUrl: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: GITHUB_SCOPE,
    state: callbackUrl,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    get_started_with: 'copilot-vscode',
    prompt: 'select_account'
  })
  return `${GITHUB_AUTHORIZATION_ENDPOINT}?${params.toString()}`
}

export async function completeGitHubCopilotAuthorization(
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch
): Promise<GitHubCopilotAuthorizationResult> {
  const githubAccessToken = await exchangeGitHubCode(code, verifier, fetchImpl)
  const user = await fetchGitHubUser(githubAccessToken, fetchImpl)
  const email = user.email ?? await fetchGitHubEmail(githubAccessToken, fetchImpl)
  const copilot = await fetchCopilotCredentials(githubAccessToken, fetchImpl)
  return {
    profile: { login: user.login, name: user.name, email },
    secrets: { githubAccessToken, ...copilot }
  }
}

export async function refreshGitHubCopilotCredentials(
  githubAccessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProviderSecrets> {
  return { githubAccessToken, ...await fetchCopilotCredentials(githubAccessToken, fetchImpl) }
}

async function exchangeGitHubCode(code: string, verifier: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(GITHUB_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      code,
      redirect_uri: GITHUB_REDIRECT_URI,
      code_verifier: verifier
    }).toString()
  })
  if (!response.ok) throw new Error(`[bs] GitHub OAuth token exchange failed (${response.status})`)
  const body = await response.json() as { access_token?: string; error?: string }
  if (!body.access_token) throw new Error('[bs] GitHub OAuth token exchange failed')
  return body.access_token
}

async function fetchGitHubUser(accessToken: string, fetchImpl: typeof fetch): Promise<GitHubUser> {
  const response = await fetchImpl(GITHUB_USER_ENDPOINT, { headers: githubHeaders(accessToken, 'Bearer') })
  if (!response.ok) throw new Error(`[bs] GitHub profile fetch failed (${response.status})`)
  return response.json() as Promise<GitHubUser>
}

async function fetchGitHubEmail(accessToken: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  const response = await fetchImpl(GITHUB_USER_EMAILS_ENDPOINT, { headers: githubHeaders(accessToken, 'Bearer') })
  if ([401, 403, 404].includes(response.status)) return undefined
  if (!response.ok) throw new Error(`[bs] GitHub email fetch failed (${response.status})`)
  const emails = await response.json() as GitHubEmail[]
  return emails.find(item => item.primary && item.verified)?.email
    ?? emails.find(item => item.verified)?.email
}

async function fetchCopilotCredentials(accessToken: string, fetchImpl: typeof fetch): Promise<ProviderSecrets> {
  const response = await fetchImpl(GITHUB_COPILOT_TOKEN_ENDPOINT, { headers: githubHeaders(accessToken, 'token') })
  if (!response.ok) throw new Error(`[bs] GitHub Copilot entitlement unavailable (${response.status})`)
  const token = await response.json() as CopilotToken
  if (!token.token || token.chat_enabled === false) throw new Error('[bs] GitHub Copilot entitlement unavailable')
  let userInfo: CopilotUserInfo = {}
  try {
    const userResponse = await fetchImpl(GITHUB_COPILOT_USER_ENDPOINT, { headers: githubHeaders(accessToken, 'token') })
    if (userResponse.ok) userInfo = await userResponse.json() as CopilotUserInfo
  } catch { /* the runtime token remains usable when optional plan metadata is unavailable */ }
  return {
    accessToken: token.token,
    expiresAt: token.expires_at ? token.expires_at * 1000 : undefined,
    planName: userInfo.copilot_plan ?? token.sku
  }
}

function githubHeaders(accessToken: string, scheme: 'Bearer' | 'token'): Record<string, string> {
  return {
    authorization: `${scheme} ${accessToken}`,
    accept: 'application/json',
    'user-agent': USER_AGENT,
    'x-github-api-version': GITHUB_API_VERSION
  }
}
