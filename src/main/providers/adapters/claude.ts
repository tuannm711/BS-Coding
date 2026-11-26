import type { AuthMethodDescriptor, ProviderCapability, ProviderConnectRequest, ProviderModel } from '../../../shared/providers'
import type { ProviderAccount } from '../../../shared/types'
import type { ProviderAdapter } from '../types'
import type { ProviderSecrets } from '../../connections/types'
import { createLlm } from '../../agent/llm'

export const STATIC_CLAUDE_MODELS: ProviderModel[] = [
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }
]

const staticModelIds = STATIC_CLAUDE_MODELS.map(m => m.id)

export const DEFAULT_CLAUDE_GATEWAY_URL = 'https://api.agentshop247.com/api/claude'
export const DEFAULT_CLAUDE_AUTH_SCHEMA = 'x-api-key'

export function createClaudeAdapter(): ProviderAdapter {
  const methods: AuthMethodDescriptor[] = [
    {
      id: 'gateway',
      label: 'Gateway',
      description: 'Connect using Claude Gateway API (e.g. AgentShop247)',
      kind: 'api-key',
      fields: ['baseUrl', 'apiKey', 'authSchema'],
      supportsMultipleAccounts: true
    },
    {
      id: 'api-key',
      label: 'Direct API Key',
      description: 'Connect using an official Anthropic Claude API Key',
      kind: 'api-key',
      fields: ['apiKey'],
      supportsMultipleAccounts: true
    }
  ]

  const capability: ProviderCapability = {
    id: 'claude',
    displayName: 'Claude',
    description: 'Anthropic Claude models via official API or Gateway API',
    methods,
    status: 'ready',
    chatTransport: 'anthropic'
  }

  return {
    capability,
    definition() { return capability },
    async connect(request: ProviderConnectRequest, context) {
      if (request.methodId !== 'gateway' && request.methodId !== 'api-key') {
        throw new Error(`[bs] Phương thức kết nối không hỗ trợ: ${request.methodId}`)
      }

      const apiKey = request.fields.apiKey?.trim()
      if (!apiKey) {
        throw new Error(request.methodId === 'gateway' ? '[bs] Gateway API key không được để trống' : '[bs] Claude API key không được để trống')
      }

      const isGateway = request.methodId === 'gateway'
      const baseUrl = isGateway
        ? (request.fields.baseUrl?.trim() || DEFAULT_CLAUDE_GATEWAY_URL)
        : undefined
      const authSchema = isGateway
        ? (request.fields.authSchema?.trim() || DEFAULT_CLAUDE_AUTH_SCHEMA)
        : DEFAULT_CLAUDE_AUTH_SCHEMA

      const suffix = apiKey.length >= 8 ? `(${apiKey.slice(0, 4)}...${apiKey.slice(-4)})` : ''
      const defaultLabel = isGateway ? `Claude Gateway ${suffix}`.trim() : `Claude ${suffix}`.trim()
      const label = request.fields.label?.trim() || defaultLabel

      const account = context.saveAccount({
        providerId: 'claude',
        label,
        authMode: 'api-key',
        status: 'active',
        models: staticModelIds,
        modelCatalog: STATIC_CLAUDE_MODELS
      }, {
        apiKey,
        baseUrl,
        authSchema
      })

      return { account }
    },

    async refreshAccount(account, secret) {
      const models = await this.listModels(account, secret)
      const modelIds = models.map(m => m.id)
      return { ...account, status: 'active', models: modelIds, modelCatalog: models }
    },

    async listModels(_account?: ProviderAccount, secret?: ProviderSecrets) {
      const apiKey = secret?.apiKey
      if (apiKey) {
        const baseUrl = secret.baseUrl || 'https://api.anthropic.com/v1'
        const candidateUrls = [
          `${baseUrl.replace(/\/+$/, '')}/models`,
          `${baseUrl.replace(/\/+$/, '')}/v1/models`
        ]

        const headers: Record<string, string> = {
          'anthropic-version': '2023-06-01'
        }
        if (secret.authSchema?.toLowerCase() === 'bearer') {
          headers['authorization'] = `Bearer ${apiKey}`
        } else {
          headers['x-api-key'] = apiKey
        }

        for (const url of candidateUrls) {
          try {
            const res = await fetch(url, {
              headers,
              signal: AbortSignal.timeout(5000)
            })
            if (res.ok) {
              const data = await res.json() as { data?: Array<{ id: string; display_name?: string }> }
              if (Array.isArray(data?.data) && data.data.length > 0) {
                return data.data.map(m => ({
                  id: m.id,
                  name: m.display_name || m.id,
                  capabilities: {
                    isCodeModel: true,
                    supportsStreaming: true,
                    supportsTools: true
                  }
                }))
              }
            }
          } catch {
            // Fallback to next URL or static models
          }
        }
      }
      return STATIC_CLAUDE_MODELS
    },

    createRuntime(_account, secret, _model) {
      const headers: Record<string, string> = {}
      if (secret.authSchema?.toLowerCase() === 'bearer') {
        headers['authorization'] = `Bearer ${secret.apiKey}`
      } else {
        headers['x-api-key'] = secret.apiKey ?? ''
      }
      return createLlm('claude', secret.apiKey ?? '', secret.baseUrl, headers)
    }
  }
}
