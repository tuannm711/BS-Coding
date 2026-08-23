import type { ProviderModel } from '../../../shared/providers'
import type { ProviderAdapter } from '../types'
import { createLlm } from '../../agent/llm'
import { OPENAI_OAUTH_MODELS } from '../../../shared/openai-oauth'

const models: ProviderModel[] = OPENAI_OAUTH_MODELS.map(id => ({ id, name: id, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true, speedModes: ['standard', 'fast'] } }))

export function createOpenAiAdapter(): ProviderAdapter {
  return {
    capability: {
      id: 'openai',
      displayName: 'OpenAI / ChatGPT',
      description: 'ChatGPT OAuth or OpenAI API key for coding agents',
      methods: [
        { id: 'oauth', label: 'OAuth sign-in', description: 'Sign in with ChatGPT in your browser', kind: 'oauth', fields: [], opensBrowser: true, supportsMultipleAccounts: true },
        { id: 'api-key', label: 'API key', description: 'Use an OpenAI API key', kind: 'api-key', fields: ['apiKey', 'baseUrl'] }
      ],
      status: 'ready'
    },
    definition() { return this.capability },
    async connect(request, context) {
      if (request.methodId !== 'api-key') throw new Error('[bs] OpenAI OAuth cần được bắt đầu qua login session')
      const label = request.fields.label?.trim() || 'OpenAI API account'
      const account = context.saveAccount({ providerId: 'openai', label, authMode: 'api-key', status: 'active', profile: { name: label } }, { apiKey: request.fields.apiKey, baseUrl: request.fields.baseUrl })
      return { account }
    },
    async refreshAccount(account) { return account },
    async listModels(account) {
      return account.authMode === 'oauth' ? models : models
    },
    createRuntime(_account, secret, _model) {
      return createLlm('openai', secret.apiKey ?? '', secret.baseUrl)
    }
  }
}
