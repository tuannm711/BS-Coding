import type { AuthMethodDescriptor, ProviderCapability, ProviderConnectRequest, ProviderModel } from '../../../shared/providers'
import type { ProviderAccount } from '../../../shared/types'
import type { ProviderAdapter } from '../types'
import type { ProviderSecrets } from '../../connections/types'
import { createLlm } from '../../agent/llm'

const STATIC_GEMINI_MODELS: ProviderModel[] = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
  { id: 'gemini-3.1-flash', name: 'Gemini 3.1 Flash', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }
]

const staticModelIds = STATIC_GEMINI_MODELS.map(m => m.id)

export function createGoogleAdapter(): ProviderAdapter {
  const methods: AuthMethodDescriptor[] = [
    {
      id: 'gemini-api-key',
      label: 'Gemini API Key',
      description: 'Connect using an official Google Gemini API Key from AI Studio',
      kind: 'api-key',
      fields: ['apiKey'],
      supportsMultipleAccounts: true
    }
  ]

  const capability: ProviderCapability = {
    id: 'google',
    displayName: 'Google / Gemini',
    description: 'Official Google Gemini Developer API integration',
    methods,
    status: 'ready',
    chatTransport: 'google'
  }

  return {
    capability,
    definition() { return capability },
    async connect(request: ProviderConnectRequest, context) {
      if (request.methodId !== 'gemini-api-key') {
        throw new Error(`[bs] Phương thức kết nối không hỗ trợ: ${request.methodId}`)
      }

      const apiKey = request.fields.apiKey?.trim()
      if (!apiKey) throw new Error('[bs] Gemini API key không được để trống')
      const label = `Gemini (${apiKey.slice(0, 4)}...${apiKey.slice(-4)})`
      const account = context.saveAccount({
        providerId: 'google',
        label,
        authMode: 'api-key',
        status: 'active',
        models: staticModelIds,
        modelCatalog: STATIC_GEMINI_MODELS
      }, { apiKey })
      return { account }
    },

    async refreshAccount(account, secret) {
      const models = await this.listModels(account, secret)
      const modelIds = models.map(m => m.id)
      return { ...account, status: 'active', models: modelIds, modelCatalog: models }
    },

    async listModels(account?: ProviderAccount, secret?: ProviderSecrets) {
      const apiKey = secret?.apiKey
      if (apiKey) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
            signal: AbortSignal.timeout(10000)
          })
          if (res.ok) {
            const data = await res.json() as any
            if (Array.isArray(data?.models)) {
              const discovered: ProviderModel[] = []
              for (const m of data.models) {
                const id = typeof m.name === 'string' ? m.name.replace(/^models\//, '') : ''
                if (!id) continue
                // Exclude 1.5 models, embeddings, imagen, aqa
                if (id.includes('1.5') || id.includes('embedding') || id.includes('imagen') || id.includes('aqa')) {
                  continue
                }
                const methods: string[] = m.supportedGenerationMethods || []
                if (methods.length > 0 && !methods.includes('generateContent')) {
                  continue
                }
                discovered.push({
                  id,
                  name: m.displayName || id,
                  capabilities: {
                    isCodeModel: true,
                    supportsStreaming: true,
                    supportsTools: true
                  }
                })
              }
              if (discovered.length > 0) {
                return discovered
              }
            }
          }
        } catch {
          // Fall back to static catalog on failure
        }
      }
      return STATIC_GEMINI_MODELS
    },

    createRuntime(account, secret, model) {
      return createLlm('google', secret.apiKey || '', secret.baseUrl)
    }
  }
}
