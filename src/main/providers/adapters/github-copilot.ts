import type { ProviderAdapter } from '../types'
import type { ProviderSecrets } from '../../connections/types'
import { createLlm } from '../../agent/llm'
import { normalizeProviderImport } from '../auth/import-normalizer'
import { normalizeGitHubCopilotUsage } from '../github-copilot-usage'
import { copilotApiBaseUrl, parseGitHubCopilotModels, COPILOT_RUNTIME_HEADERS } from '../github-copilot-models'
import { OpenAIResponsesClient } from '../../agent/openai-responses'
import {
  startGitHubCopilotDeviceAuthorization,
  refreshGitHubCopilotCredentials,
  fetchGitHubCopilotQuota
} from '../auth/github-copilot-oauth'

// Takes the whole secret, which is what createRuntime hands it. Naming only the
// two fields it reads made a caller passing a full ProviderSecrets a type error
// even though that is the only way it is ever called.
export function copilotRuntimeCredential(secret: ProviderSecrets): string {
  const token = secret.apiKey ?? secret.accessToken
  if (!token) throw new Error('[bs] GitHub Copilot runtime token unavailable')
  return token
}

export function createGitHubCopilotAdapter(): ProviderAdapter {
  return {
    capability: {
      id: 'github-copilot',
      displayName: 'GitHub Copilot',
      description: 'OAuth or Token/JSON import for Copilot coding models',
      methods: [
        { id: 'oauth', label: 'OAuth sign-in', description: 'Authorize with GitHub', kind: 'oauth', fields: [], opensBrowser: true, supportsMultipleAccounts: true },
        { id: 'imported', label: 'Token / JSON import', description: 'Import a GitHub token or Copilot credential JSON', kind: 'imported', fields: ['credentialJson'], supportsMultipleAccounts: true }
      ],
      status: 'experimental',
      chatTransport: 'openai-compatible'
    },
    authorization: {
      kind: 'device',
      methodId: 'oauth',
      async start({ signal }) {
        const device = await startGitHubCopilotDeviceAuthorization(signal)
        return {
          ...device,
          async complete() {
            const result = await device.complete()
            return {
              account: {
                providerId: 'github-copilot',
                label: result.profile.email ?? result.profile.login,
                authMode: 'oauth',
                status: 'active',
                profile: { email: result.profile.email, name: result.profile.name ?? result.profile.login, planName: result.secrets.planName },
                oauthExpiresAt: result.secrets.expiresAt
              },
              secrets: result.secrets
            }
          },
        }
      }
    },
    definition() { return this.capability },
    async connect(request, context) {
      if (request.methodId === 'oauth') throw new Error('[bs] GitHub Copilot OAuth session chưa được bật trong runtime này')
      const secret = normalizeProviderImport('github-copilot', request.fields.credentialJson ?? '')
      const label = request.fields.label?.trim() || 'GitHub Copilot account'
      if (secret.githubAccessToken) {
        try {
          const raw = await fetchGitHubCopilotQuota(secret.githubAccessToken) as { copilot_plan?: unknown }
          if (typeof raw?.copilot_plan === 'string') secret.planName = raw.copilot_plan
        } catch { /* Catalog itself must still validate; missing plan metadata is not guessed. */ }
      }
      const modelCatalog = await this.listModels({ id: 'pending', providerId: 'github-copilot', label, authMode: 'imported', status: 'active', createdAt: 0, lastUsedAt: 0 }, secret)
      const account = context.saveAccount({ providerId: 'github-copilot', label, authMode: 'imported', status: 'active', models: modelCatalog.map(model => model.id), modelCatalog, profile: { name: label, planName: secret.planName } }, secret)
      return { account }
    },
    async refreshAccount(account) { return account },
    async fetchUsage(account, secret) {
      if (!secret.githubAccessToken) return { accountId: account.id, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', statusReason: 'Reconnect with GitHub OAuth to read account quota; a Copilot runtime token cannot read GitHub identity quota' }
      return normalizeGitHubCopilotUsage(account, await fetchGitHubCopilotQuota(secret.githubAccessToken))
    },
    async refreshCredentials(account, secret, options) {
      if (account.authMode !== 'oauth' || !secret.githubAccessToken) return secret
      if (!options?.force && secret.expiresAt && secret.expiresAt > Date.now() + 60_000) return secret
      return { ...secret, ...await refreshGitHubCopilotCredentials(secret.githubAccessToken) }
    },
    async listModels(account, secret) {
      const response = await fetch(`${copilotApiBaseUrl(secret.baseUrl)}/models`, {
        headers: { ...COPILOT_RUNTIME_HEADERS, accept: 'application/json', authorization: `Bearer ${copilotRuntimeCredential(secret)}` },
        signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) throw new Error(`[bs] GitHub Copilot model discovery failed (HTTP ${response.status}). Refresh or reconnect this account.`)
      const models = parseGitHubCopilotModels(await response.json(), secret.planName ?? account.usage?.planName ?? account.profile?.planName)
      if (!models.length) throw new Error('[bs] GitHub Copilot catalog has no compatible enabled agent models. Check model access and account plan, then Refresh.')
      return models
    },
    createRuntime(_account, secret, model) {
      const key = copilotRuntimeCredential(secret)
      const baseUrl = copilotApiBaseUrl(secret.baseUrl)
      return model.transport === 'openai-responses' ? new OpenAIResponsesClient({ apiKey: key, baseUrl, headers: COPILOT_RUNTIME_HEADERS })
        : createLlm('openai-compatible', key, baseUrl, COPILOT_RUNTIME_HEADERS)
    }
  }
}
