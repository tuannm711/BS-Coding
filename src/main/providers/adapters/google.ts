import type { AuthMethodDescriptor, ProviderCapability, ProviderConnectRequest, ProviderModel } from '../../../shared/providers'
import type { ProviderAccount } from '../../../shared/types'
import type { ProviderAdapter } from '../types'
import { createLlm } from '../../agent/llm'

const GEMINI_MODELS: ProviderModel[] = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }
]

const modelIds = GEMINI_MODELS.map(m => m.id)

export function createGoogleAdapter(): ProviderAdapter {
  const methods: AuthMethodDescriptor[] = [
    {
      id: 'gemini-api-key',
      label: 'Gemini API Key',
      description: 'Connect using an official Google Gemini API Key from AI Studio',
      kind: 'api-key',
      fields: ['apiKey'],
      supportsMultipleAccounts: true
    },
    {
      id: 'vertex-ai',
      label: 'Vertex AI / Google Cloud',
      description: 'Connect using Google Cloud Vertex AI (Project ID & API Key)',
      kind: 'api-key',
      fields: ['projectId', 'location', 'apiKey'],
      supportsMultipleAccounts: true
    }
  ]

  const capability: ProviderCapability = {
    id: 'google',
    displayName: 'Google / Gemini',
    description: 'Official Google Gemini Developer API or Vertex AI integration',
    methods,
    status: 'ready',
    chatTransport: 'google'
  }

  return {
    capability,
    definition() { return capability },
    async connect(request: ProviderConnectRequest, context) {
      if (request.methodId === 'vertex-ai') {
        const apiKey = request.fields.apiKey?.trim()
        const projectId = request.fields.projectId?.trim()
        const location = request.fields.location?.trim() || 'us-central1'
        if (!apiKey) throw new Error('[bs] Gemini API key không được để trống')
        const account = context.saveAccount({
          providerId: 'google',
          label: `Vertex AI (${projectId || 'GCP'})`,
          authMode: 'api-key',
          status: 'active',
          models: modelIds,
          modelCatalog: GEMINI_MODELS
        }, { apiKey, projectId, location })
        return { account }
      }

      const apiKey = request.fields.apiKey?.trim()
      if (!apiKey) throw new Error('[bs] Gemini API key không được để trống')
      const label = `Gemini (${apiKey.slice(0, 4)}...${apiKey.slice(-4)})`
      const account = context.saveAccount({
        providerId: 'google',
        label,
        authMode: 'api-key',
        status: 'active',
        models: modelIds,
        modelCatalog: GEMINI_MODELS
      }, { apiKey })
      return { account }
    },

    async refreshAccount(account, secret) {
      return { ...account, status: 'active', models: modelIds, modelCatalog: GEMINI_MODELS }
    },

    async listModels() {
      return GEMINI_MODELS
    },

    createRuntime(account, secret, model) {
      return createLlm('google', secret.apiKey || '', secret.baseUrl)
    }
  }
}
