import type { ProviderAdapter } from '../types'
import { createAntigravityLlm } from '../../agent/antigravity-llm'
import { hasKnownAntigravityQuota, parseAntigravityModels, parseAntigravityQuotaSummary } from '../antigravity-models'
import {
  antigravityAuthorizeUrl,
  exchangeAntigravityCode,
  fetchAntigravityProfile,
  refreshAntigravityToken
} from '../auth/antigravity-oauth'
import { classifyProviderError } from '../../../shared/provider-state'

const ANTIGRAVITY_CODE_MODELS = [
  { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' },
  { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)' },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)' },
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)' },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' }
] as const

const CLOUD_CODE_DAILY_URL = 'https://daily-cloudcode-pa.googleapis.com'
const ANTIGRAVITY_USER_AGENT = 'antigravity/1.20.5 windows/amd64'

function projectIdFrom(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' && id.trim()) return id.trim()
  }
  return undefined
}

async function resolveCloudCodeContext(secret: Parameters<NonNullable<ProviderAdapter['refreshCredentials']>>[1]): Promise<{ baseUrl: string; projectId: string; planName?: string }> {
  if (!secret.accessToken) throw new Error('[bs] Antigravity OAuth access token unavailable')
  if (secret.projectId) return { baseUrl: secret.cloudCodeBaseUrl ?? CLOUD_CODE_DAILY_URL, projectId: secret.projectId, planName: secret.planName }
  const baseUrl = secret.cloudCodeBaseUrl ?? CLOUD_CODE_DAILY_URL
  const response = await fetch(`${baseUrl}/v1internal:loadCodeAssist`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret.accessToken}`,
      'content-type': 'application/json',
      accept: '*/*',
      'user-agent': `${ANTIGRAVITY_USER_AGENT} google-api-nodejs-client/10.3.0`,
      'x-goog-api-client': 'gl-node/22.21.1'
    },
    body: JSON.stringify({
      metadata: { ideName: 'antigravity', ideType: 'ANTIGRAVITY', ideVersion: '1.20.5', pluginVersion: '1.0.0', platform: 'WINDOWS_AMD64', updateChannel: 'stable', pluginType: 'GEMINI' },
      mode: 'FULL_ELIGIBILITY_CHECK'
    })
  })
  if (!response.ok) throw new Error(`[bs] Antigravity account context discovery failed (${response.status})`)
  const body = await response.json() as { cloudaicompanionProject?: unknown; paidTier?: { id?: string }; currentTier?: { id?: string } }
  const projectId = projectIdFrom(body.cloudaicompanionProject)
  if (!projectId) throw new Error('[bs] Antigravity account context did not return a project ID')
  const planName = body.paidTier?.id ?? body.currentTier?.id
  Object.assign(secret, { projectId, planName, cloudCodeBaseUrl: baseUrl })
  return { baseUrl, projectId, planName }
}

async function fetchAvailableModels(secret: Parameters<NonNullable<ProviderAdapter['refreshCredentials']>>[1]): Promise<Response> {
  const context = await resolveCloudCodeContext(secret)
  return fetch(`${context.baseUrl}/v1internal:fetchAvailableModels`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret.accessToken}`, 'content-type': 'application/json', 'user-agent': ANTIGRAVITY_USER_AGENT },
    body: JSON.stringify({ project: context.projectId })
  })
}

async function refreshCredentials(
  account: Parameters<ProviderAdapter['refreshAccount']>[0],
  secret: Parameters<NonNullable<ProviderAdapter['refreshCredentials']>>[1],
  options?: { force?: boolean }
) {
  const expiresAt = secret.expiresAt ?? account.oauthExpiresAt
  if (!options?.force && (!expiresAt || expiresAt > Date.now() + 60_000)) return secret
  if (!secret.refreshToken) {
    if (secret.accessToken) return secret
    throw new Error('[bs] Antigravity OAuth refresh token unavailable')
  }
  const refreshed = await refreshAntigravityToken(secret.refreshToken)
  return { ...secret, ...refreshed }
}

async function fetchQuotaPayload(secret: Parameters<NonNullable<ProviderAdapter['refreshCredentials']>>[1]): Promise<{ response: Response; raw: string; payload: unknown }> {
  const context = await resolveCloudCodeContext(secret)
  let last: { response: Response; raw: string; payload: unknown } | undefined
  for (const method of ['retrieveUserQuotaSummary', 'retrieveUserQuota', 'fetchAvailableModels']) {
    const response = await fetch(`${context.baseUrl}/v1internal:${method}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret.accessToken}`, 'content-type': 'application/json', 'user-agent': ANTIGRAVITY_USER_AGENT },
      body: JSON.stringify({ project: context.projectId })
    })
    const raw = await response.text()
    let payload: unknown = {}
    try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {} }
    const current = { response, raw, payload }
    if (!response.ok && [401, 403, 429].includes(response.status)) return current
    last = current
    if (response.ok && hasKnownAntigravityQuota(payload)) return current
  }
  return last ?? { response: new Response('', { status: 503 }), raw: '', payload: {} }
}

export function createAntigravityAdapter(): ProviderAdapter {
  return {
    capability: {
      id: 'antigravity',
      displayName: 'Antigravity IDE',
      description: 'Google OAuth authorization for Antigravity IDE accounts',
      methods: [
        { id: 'oauth', label: 'OAuth authorization', description: 'Authorize with Google and store an offline refresh token', kind: 'oauth', fields: [], opensBrowser: true, supportsMultipleAccounts: true }
      ],
      status: 'experimental',
      chatTransport: 'cloud-code'
    },
    authorization: {
      methodId: 'oauth',
      callback: { port: 1457, path: '/auth/callback', timeoutMs: 300_000 },
      build({ pkce }) {
        return { authUrl: antigravityAuthorizeUrl(pkce), expectedState: pkce.state }
      },
      async complete({ code, verifier }) {
        const tokens = await exchangeAntigravityCode(code, verifier)
        const profile = await fetchAntigravityProfile(tokens.accessToken)
        return {
          account: {
            providerId: 'antigravity',
            label: profile.email ?? `Antigravity account ${new Date().toLocaleString()}`,
            authMode: 'oauth',
            status: 'active',
            profile: { email: profile.email, name: profile.name },
            oauthExpiresAt: tokens.expiresAt
          },
          secrets: tokens
        }
      }
    },
    definition() { return this.capability },
    async connect() { throw new Error('[bs] Antigravity OAuth phải được bắt đầu qua login session') },
    async refreshAccount(account) { return account },
    async refreshCredentials(account, secret, options) {
      return refreshCredentials(account, secret, options)
    },
    async listModels(_account, secret) {
      if (secret.accessToken) {
        const response = await fetchAvailableModels(secret)
        if (!response.ok) throw new Error(`[bs] Antigravity model discovery failed (${response.status})`)
        const discovered = parseAntigravityModels(await response.json())
        if (discovered.length > 0) return discovered
        throw new Error('[bs] Antigravity model discovery returned no code models')
      }
      return ANTIGRAVITY_CODE_MODELS.map(model => ({ ...model, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }))
    },
    createRuntime(_account, secret, model) {
      if (!secret.accessToken) throw new Error('[bs] Antigravity OAuth access token unavailable')
      if (!secret.projectId) throw new Error('[bs] Antigravity account project unavailable; refresh the provider before chatting')
      return createAntigravityLlm(secret.accessToken, {
        baseUrl: secret.cloudCodeBaseUrl ?? CLOUD_CODE_DAILY_URL,
        projectId: secret.projectId,
        modelId: model.id,
        isGemini3: /gemini\s*3/i.test(model.name) || /^gemini-3(?:\.|-|$)/i.test(model.runtimeId ?? '')
      })
    },
    async recoverRuntimeContext(account, secret) {
      const staleContextCleared = { ...secret }
      delete staleContextCleared.projectId
      const readySecret = await refreshCredentials(account, staleContextCleared, { force: true })
      delete readySecret.projectId
      await resolveCloudCodeContext(readySecret)
      const response = await fetchAvailableModels(readySecret)
      if (!response.ok) throw new Error(`[bs] Antigravity model discovery failed (${response.status})`)
      const models = parseAntigravityModels(await response.json())
      if (models.length === 0) throw new Error('[bs] Antigravity model discovery returned no code models')
      return { secret: readySecret, models }
    },
    async fetchUsage(account, secret) {
      if (!secret.accessToken) return { accountId: account.id, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'OAuth access token unavailable' }
      const request = () => fetchQuotaPayload(secret)
      let result = await request()
      if ((result.response.status === 401 || result.response.status === 403) && secret.refreshToken) {
        const refreshed = await refreshAntigravityToken(secret.refreshToken)
        Object.assign(secret, refreshed)
        result = await request()
      }
      const metadata = { accountLabel: account.profile?.email ?? account.label, accountType: 'oauth' as const, planName: secret.planName ?? account.profile?.planName }
      if (!result.response.ok) {
        const retryAfter = Number(result.response.headers.get('retry-after') ?? 0)
        const error = classifyProviderError(result.response.status, result.raw)
        const unavailableReason = error.kind === 'quota-exhausted'
          ? 'Quota exhausted'
          : error.kind === 'capacity-exhausted'
            ? 'Model capacity exhausted'
            : error.kind === 'auth'
              ? 'Authentication expired'
              : `Quota request failed (${result.response.status})`
        return {
          accountId: account.id,
          ...metadata,
          refreshedAt: Date.now(),
          source: 'provider',
          status: result.response.status === 429 ? 'near-limit' : 'unavailable',
          unavailableReason,
          ...(retryAfter > 0 ? { resetAt: Date.now() + retryAfter * 1000 } : {})
        }
      }
      return parseAntigravityQuotaSummary(account.id, result.payload, metadata)
    }
  }
}
