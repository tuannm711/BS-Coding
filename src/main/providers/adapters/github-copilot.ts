import type { ProviderAdapter } from '../types'
import type { ProviderSecrets } from '../../connections/types'
import type { ProviderConnectRequest } from '../../../shared/providers'
import { createLlm } from '../../agent/llm'
import { normalizeProviderImport } from '../auth/import-normalizer'
import {
  completeGitHubCopilotAuthorization,
  githubCopilotAuthorizeUrl,
  refreshGitHubCopilotCredentials
} from '../auth/github-copilot-oauth'

const COPILOT_BASE_URL = 'https://api.githubcopilot.com'

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
      methodId: 'oauth',
      callback: { port: 0, path: '/callback', timeoutMs: 300_000 },
      build({ pkce, callbackUrl }) {
        const localCallback = new URL(callbackUrl)
        localCallback.searchParams.set('nonce', pkce.state)
        const expectedState = localCallback.toString()
        return { authUrl: githubCopilotAuthorizeUrl(pkce, expectedState), expectedState }
      },
      async complete({ code, verifier }) {
        const result = await completeGitHubCopilotAuthorization(code, verifier)
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
      }
    },
    definition() { return this.capability },
    async connect(request, context) {
      if (request.methodId === 'oauth') throw new Error('[bs] GitHub Copilot OAuth session chưa được bật trong runtime này')
      const secret = normalizeProviderImport('github-copilot', request.fields.credentialJson ?? '')
      const label = request.fields.label?.trim() || 'GitHub Copilot account'
      const models = ['gpt-4.1', 'claude-sonnet-4']
      const account = context.saveAccount({ providerId: 'github-copilot', label, authMode: 'imported', status: 'active', models, profile: { name: label } }, secret)
      return { account }
    },
    async refreshAccount(account) { return account },
    async refreshCredentials(account, secret, options) {
      if (account.authMode !== 'oauth' || !secret.githubAccessToken) return secret
      if (!options?.force && secret.expiresAt && secret.expiresAt > Date.now() + 60_000) return secret
      return { ...secret, ...await refreshGitHubCopilotCredentials(secret.githubAccessToken) }
    },
    async listModels(account) {
      return (account.models ?? ['gpt-4.1', 'claude-sonnet-4']).map(id => ({ id, name: id, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }))
    },
    createRuntime(_account, secret, _model) {
      return createLlm('openai-compatible', copilotRuntimeCredential(secret), COPILOT_BASE_URL, { 'editor-version': 'vscode/1.95.0', 'copilot-integration-id': 'vscode-chat' })
    }
  }
}
