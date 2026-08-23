import type { ProviderAdapter } from '../types'
import type { ProviderConnectRequest } from '../../../shared/providers'
import { createLlm } from '../../agent/llm'
import { normalizeProviderImport } from '../auth/import-normalizer'

const COPILOT_BASE_URL = 'https://api.githubcopilot.com'

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
      status: 'experimental'
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
    async listModels(account) {
      return (account.models ?? ['gpt-4.1', 'claude-sonnet-4']).map(id => ({ id, name: id, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }))
    },
    createRuntime(_account, secret, _model) {
      return createLlm('openai-compatible', secret.apiKey ?? secret.accessToken ?? '', COPILOT_BASE_URL, { 'editor-version': 'vscode/1.95.0', 'copilot-integration-id': 'vscode-chat' })
    }
  }
}
