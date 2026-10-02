import type { ProviderSecrets } from '../../connections/types'
import { OAuthCallbackError } from '../../connections/oauth'
import { copilotApiBaseUrl } from '../github-copilot-models'

const GITHUB_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_ENDPOINT = 'https://api.github.com/user'
const GITHUB_USER_EMAILS_ENDPOINT = 'https://api.github.com/user/emails'
const GITHUB_COPILOT_TOKEN_ENDPOINT = 'https://api.github.com/copilot_internal/v2/token'
const GITHUB_COPILOT_USER_ENDPOINT = 'https://api.github.com/copilot_internal/user'
const GITHUB_CLIENT_ID = '01ab8ac9400c4e429b23'
// GitHub rejects unsupported REST version dates with HTTP 400, even with a valid OAuth token.
const GITHUB_API_VERSION = '2022-11-28'
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
  endpoints?: { api?: string }
}

interface CopilotUserInfo {
  copilot_plan?: string
}

export interface GitHubCopilotAuthorizationResult {
  profile: { login: string; name?: string; email?: string }
  secrets: ProviderSecrets
}

// Device Flow can exchange a grant in a desktop app without embedding a client secret.
export async function startGitHubCopilotDeviceAuthorization(signal: AbortSignal, fetchImpl: typeof fetch = fetch) {
  const request: typeof fetch = async (input, init) => {
    signal.throwIfAborted()
    const response = await fetchImpl(input, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) })
    signal.throwIfAborted()
    return response
  }
  const response = await request('https://github.com/login/device/code', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
    body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, scope: 'read:user user:email' }).toString()
  })
  if (!response.ok) throw new Error(`[bs] GitHub device authorization failed (${response.status})`)
  const grant = await response.json() as { device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number }
  if (!grant.device_code || !grant.user_code || grant.verification_uri !== 'https://github.com/login/device'
    || !Number.isFinite(grant.expires_in) || grant.expires_in! <= 0) {
    throw new Error('[bs] GitHub device authorization returned an invalid grant')
  }
  const expiresAt = Date.now() + grant.expires_in! * 1000
  let interval = Number.isFinite(grant.interval) && grant.interval! > 0 ? grant.interval! * 1000 : 5000
  return {
    authUrl: grant.verification_uri,
    userCode: grant.user_code,
    expiresAt,
    async complete(): Promise<GitHubCopilotAuthorizationResult> {
      while (Date.now() < expiresAt) {
        await waitForPoll(Math.min(interval, expiresAt - Date.now()), signal)
        signal.throwIfAborted()
        if (Date.now() >= expiresAt) break
        const tokenResponse = await request(GITHUB_TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
          body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, device_code: grant.device_code!, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }).toString()
        })
        if (!tokenResponse.ok) throw new Error(`[bs] GitHub OAuth token exchange failed (${tokenResponse.status})`)
        const token = await tokenResponse.json() as { access_token?: string; error?: string; interval?: number }
        signal.throwIfAborted()
        if (token.error === 'authorization_pending') continue
        if (token.error === 'slow_down') {
          interval = Math.max(interval + 5000, Number.isFinite(token.interval) ? token.interval! * 1000 : 0)
          continue
        }
        if (token.error === 'expired_token') break
        if (token.error === 'access_denied') throw new OAuthCallbackError('authorization-denied', '[bs] GitHub authorization was denied. Generate a new code to try again.')
        if (!token.access_token) throw new Error(`[bs] GitHub OAuth token exchange failed (${safeDeviceError(token.error)})`)
        const githubAccessToken = token.access_token
        const user = await fetchGitHubUser(githubAccessToken, request)
        const email = user.email ?? await fetchGitHubEmail(githubAccessToken, request)
        const copilot = await fetchCopilotCredentials(githubAccessToken, request)
        signal.throwIfAborted()
        return { profile: { login: user.login, name: user.name, email }, secrets: { githubAccessToken, ...copilot } }
      }
      throw new OAuthCallbackError('authorization-expired', '[bs] GitHub authorization code expired. Generate a new code to try again.')
    }
  }
}

function safeDeviceError(error?: string): string {
  return ['incorrect_device_code', 'incorrect_client_credentials', 'device_flow_disabled', 'unsupported_grant_type'].includes(error ?? '') ? error! : 'invalid response'
}

function waitForPoll(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function refreshGitHubCopilotCredentials(
  githubAccessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProviderSecrets> {
  return { githubAccessToken, ...await fetchCopilotCredentials(githubAccessToken, fetchImpl) }
}

export async function fetchGitHubCopilotQuota(githubAccessToken: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const response = await fetchImpl(GITHUB_COPILOT_USER_ENDPOINT, {
    headers: { ...githubHeaders(githubAccessToken, 'token'), 'editor-version': 'vscode/1.95.0', 'copilot-integration-id': 'vscode-chat' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`[bs] GitHub Copilot quota ${response.status === 401 || response.status === 403 ? 'authentication failed; reconnect with GitHub OAuth' : 'request failed'} (HTTP ${response.status})`)
  return response.json()
}

async function fetchGitHubUser(accessToken: string, fetchImpl: typeof fetch): Promise<GitHubUser> {
  const response = await fetchImpl(GITHUB_USER_ENDPOINT, { headers: githubHeaders(accessToken, 'Bearer') })
  if (!response.ok) throw new OAuthCallbackError('profile-fetch-failed', `[bs] GitHub profile could not be loaded (HTTP ${response.status}). Generate a new link to try again.`)
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
    planName: userInfo.copilot_plan ?? token.sku,
    ...(typeof token.endpoints?.api === 'string' ? { baseUrl: copilotApiBaseUrl(token.endpoints.api) } : {})
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
