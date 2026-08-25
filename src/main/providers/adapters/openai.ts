import type { ProviderModel } from '../../../shared/providers'
import type { ProviderAdapter } from '../types'
import { createLlm } from '../../agent/llm'
import { OPENAI_OAUTH_MODELS } from '../../../shared/openai-oauth'
import { extractOpenAISubscriptionMetadata, normalizeOpenAICodexUsage } from '../../connections/usage'
import {
  codexAuthorizeUrl,
  decodeJwtProfile,
  exchangeCodexCode,
  mergeCodexAuthFile,
  refreshCodexToken
} from '../../connections/codex'

const models: ProviderModel[] = OPENAI_OAUTH_MODELS.map(id => ({ id, name: id, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true, speedModes: ['standard', 'fast'] } }))

interface OpenAiAdapterOptions {
  codexAuthFile?: string
  codexBackupFile?: string
}

export function createOpenAiAdapter(options: OpenAiAdapterOptions = {}): ProviderAdapter {
  return {
    capability: {
      id: 'openai',
      displayName: 'OpenAI / ChatGPT',
      description: 'ChatGPT OAuth or OpenAI API key for coding agents',
      methods: [
        { id: 'oauth', label: 'OAuth sign-in', description: 'Sign in with ChatGPT in your browser', kind: 'oauth', fields: [], opensBrowser: true, supportsMultipleAccounts: true },
        { id: 'api-key', label: 'API key', description: 'Use an OpenAI API key', kind: 'api-key', fields: ['apiKey', 'baseUrl'] }
      ],
      status: 'ready',
      chatTransport: 'openai-responses'
    },
    authorization: {
      methodId: 'oauth',
      callback: { port: 1455, path: '/auth/callback', timeoutMs: 300_000 },
      build({ pkce }) {
        return { authUrl: codexAuthorizeUrl(pkce), expectedState: pkce.state }
      },
      async complete({ code, verifier }) {
        const tokens = await exchangeCodexCode(code, verifier)
        const profile = decodeJwtProfile(tokens.idToken)
        return {
          account: {
            providerId: 'openai',
            label: profile.email ?? `ChatGPT account ${new Date().toLocaleString()}`,
            authMode: 'oauth',
            status: 'active',
            profile: { email: profile.email, name: profile.name },
            oauthExpiresAt: tokens.expiresAt
          },
          secrets: { ...tokens, accountId: profile.accountId }
        }
      },
      afterPersist(_account, secrets) {
        if (!options.codexAuthFile) return
        mergeCodexAuthFile(options.codexAuthFile, {
          accessToken: secrets.accessToken ?? '',
          refreshToken: secrets.refreshToken ?? '',
          idToken: secrets.idToken,
          accountId: secrets.accountId,
          expiresAt: secrets.expiresAt
        }, options.codexBackupFile)
      }
    },
    definition() { return this.capability },
    async connect(request, context) {
      if (request.methodId !== 'api-key') throw new Error('[bs] OpenAI OAuth cần được bắt đầu qua login session')
      const label = request.fields.label?.trim() || 'OpenAI API account'
      const account = context.saveAccount({ providerId: 'openai', label, authMode: 'api-key', status: 'active', profile: { name: label } }, { apiKey: request.fields.apiKey, baseUrl: request.fields.baseUrl })
      return { account }
    },
    async refreshAccount(account) { return account },
    async refreshCredentials(account, secret, options) {
      if (account.authMode !== 'oauth') return secret
      const expiresAt = secret.expiresAt ?? account.oauthExpiresAt
      if (!options?.force && (!expiresAt || expiresAt > Date.now() + 60_000)) return secret
      if (!secret.refreshToken) throw new Error('[bs] ChatGPT OAuth refresh token unavailable')
      const refreshed = await refreshCodexToken(secret.refreshToken)
      return { ...secret, ...refreshed }
    },
    async listModels(account) {
      return account.authMode === 'oauth' ? models : models
    },
    createRuntime(account, secret, _model) {
      if (account.authMode === 'oauth') {
        if (!secret.accessToken) throw new Error('[bs] ChatGPT OAuth access token unavailable')
        return createLlm('openai', secret.accessToken, 'https://chatgpt.com/backend-api/codex', {
          ...(secret.accountId ? { 'ChatGPT-Account-ID': secret.accountId } : {}),
          originator: 'codex_vscode',
          'OpenAI-Beta': 'responses_websockets=2026-02-06',
          'x-openai-internal-codex-residency': 'us',
          accept: 'text/event-stream'
        })
      }
      return createLlm('openai', secret.apiKey ?? '', secret.baseUrl)
    },
    async fetchUsage(account, secret) {
      if (account.authMode !== 'oauth' || !secret.accessToken) {
        return account.usage ?? { accountId: account.id, accountLabel: account.profile?.email ?? account.label, accountType: account.authMode === 'api-key' ? 'api-key' : 'oauth', refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'OpenAI API quota is unavailable for this connection method' }
      }
      // The stored id_token carries the account id and the subscription window,
      // so neither depends on an HTTP call that a Codex bearer may be refused.
      const claim = decodeJwtProfile(secret.idToken)
      if (!secret.accountId && claim.accountId) Object.assign(secret, { accountId: claim.accountId })
      let lastStatus = 0
      for (let authAttempt = 0; authAttempt < 2; authAttempt++) {
        const headers: Record<string, string> = {
          authorization: `Bearer ${secret.accessToken}`,
          originator: 'codex_vscode',
          'user-agent': 'codex_vscode/0.146.0',
          accept: 'application/json',
          origin: 'https://chatgpt.com',
          referer: 'https://chatgpt.com/'
        }
        if (secret.accountId) headers['ChatGPT-Account-ID'] = secret.accountId
        for (const endpoint of ['https://chatgpt.com/backend-api/wham/usage', 'https://chatgpt.com/backend-api/codex/usage']) {
          const response = await fetch(endpoint, { headers })
          const body = await response.text()
          if (!response.ok) { lastStatus = response.status; continue }
          let parsed: unknown
          try { parsed = JSON.parse(body) } catch { return { accountId: account.id, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'Quota response was not valid JSON' } }
          const normalized = normalizeOpenAICodexUsage(account.id, parsed)
          normalized.accountLabel = account.profile?.email ?? account.label
          normalized.accountType = 'oauth'
          normalized.planName = normalized.planName ?? account.profile?.planName
          const subscription = await fetchSubscriptionMetadata(headers, secret.accountId)
          normalized.planName = normalized.planName ?? subscription.planName ?? claim.planName
          normalized.subscriptionExpiresAt = subscription.subscriptionExpiresAt ?? normalized.subscriptionExpiresAt ?? claim.subscriptionExpiresAt
          return normalized
        }
        if (authAttempt === 0 && (lastStatus === 401 || lastStatus === 403) && secret.refreshToken) {
          Object.assign(secret, await refreshCodexToken(secret.refreshToken))
          continue
        }
        break
      }
      return { accountId: account.id, accountLabel: account.profile?.email ?? account.label, accountType: 'oauth', refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: `Quota request failed (${lastStatus || 'network error'})` }
    }
  }
}

async function fetchSubscriptionMetadata(headers: Record<string, string>, accountId?: string) {
  const endpoints = [
    'https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27?timezone_offset_min=420',
    ...(accountId ? [`https://chatgpt.com/backend-api/subscriptions?account_id=${encodeURIComponent(accountId)}`] : [])
  ]
  const merged: { planName?: string; subscriptionExpiresAt?: number } = {}
  for (const endpoint of endpoints) {
    if (merged.planName && merged.subscriptionExpiresAt) break
    try {
      const response = await fetch(endpoint, { headers })
      if (!response.ok) continue
      const metadata = extractOpenAISubscriptionMetadata(await response.json())
      merged.planName = merged.planName ?? metadata.planName
      merged.subscriptionExpiresAt = merged.subscriptionExpiresAt ?? metadata.subscriptionExpiresAt
    } catch { /* usage remains valid when subscription metadata is unavailable */ }
  }
  return merged
}
