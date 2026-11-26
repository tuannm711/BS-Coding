import type { AuthMethodDescriptor, ProviderCapability, ProviderConnectRequest, ProviderModel } from '../../../shared/providers'
import type { ProviderAccount, ProviderQuotaGroup, ProviderQuotaWindow, ProviderUsage } from '../../../shared/types'
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
    },

    async fetchUsage(account: ProviderAccount, secret: ProviderSecrets): Promise<ProviderUsage> {
      const apiKey = secret?.apiKey?.trim()
      const isGateway = !secret.baseUrl || secret.baseUrl.includes('agentshop247') || !secret.baseUrl.includes('anthropic.com')
      const checkUsageUrl = isGateway && apiKey ? `https://agentshop247.com/docs/check-usage?key=${encodeURIComponent(apiKey)}` : undefined

      if (!apiKey) {
        return {
          accountId: account.id,
          accountLabel: account.label,
          accountType: 'api-key',
          refreshedAt: Date.now(),
          source: 'unavailable',
          status: 'unavailable',
          statusReason: 'API key is missing',
          checkUsageUrl
        }
      }

      if (isGateway) {
        try {
          const quotaApiUrl = `https://api.agentshop247.com/api/proxy/check-usage?key=${encodeURIComponent(apiKey)}`
          const res = await fetch(quotaApiUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000)
          })

          if (res.ok) {
            const rawJson = await res.json() as {
              success?: boolean
              message?: string
              data?: Record<string, unknown>
              tokenBudget?: number
              tokensUsed?: number
              windowEnd?: string
              sessionsUsed?: number
              maxSessions?: number
              weeklyLimitResetAt?: string
            }

            const data = (rawJson.data && typeof rawJson.data === 'object' ? rawJson.data : rawJson) as {
              tokenBudget?: number
              tokensUsed?: number
              windowEnd?: string
              sessionsUsed?: number
              maxSessions?: number
              weeklyLimitResetAt?: string
              message?: string
            }

            if (rawJson.success === false) {
              return {
                accountId: account.id,
                accountLabel: account.label,
                accountType: 'api-key',
                refreshedAt: Date.now(),
                source: 'unavailable',
                status: 'unavailable',
                statusReason: rawJson.message || 'API key not found or unassigned',
                checkUsageUrl
              }
            }

            const tokenBudget = typeof data.tokenBudget === 'number' ? data.tokenBudget : undefined
            const tokensUsed = typeof data.tokensUsed === 'number' ? data.tokensUsed : 0
            const windowEnd = typeof data.windowEnd === 'string' ? data.windowEnd : undefined
            const sessionsUsed = typeof data.sessionsUsed === 'number' ? data.sessionsUsed : 0
            const maxSessions = typeof data.maxSessions === 'number' ? data.maxSessions : undefined
            const weeklyLimitResetAt = typeof data.weeklyLimitResetAt === 'string' ? data.weeklyLimitResetAt : undefined

            if (tokenBudget !== undefined && tokenBudget > 0) {
              const remainingTokens = Math.max(0, tokenBudget - tokensUsed)
              const remainingPercent = Math.min(100, Math.max(0, Math.round((remainingTokens / tokenBudget) * 100)))
              const resetAt = windowEnd ? Date.parse(windowEnd) || undefined : undefined
              const weeklyResetAt = weeklyLimitResetAt ? Date.parse(weeklyLimitResetAt) || undefined : undefined

              const windows: ProviderQuotaWindow[] = [
                {
                  id: 'token-quota',
                  label: 'Token Quota',
                  kind: 'session',
                  usageKnown: true,
                  limitCount: tokenBudget,
                  usedCount: tokensUsed,
                  remainingCount: remainingTokens,
                  remainingPercent,
                  resetAt,
                  source: 'provider'
                }
              ]

              if (maxSessions !== undefined && maxSessions > 0) {
                const remainingSessions = Math.max(0, maxSessions - sessionsUsed)
                windows.push({
                  id: 'active-sessions',
                  label: 'Active Sessions',
                  kind: 'additional',
                  usageKnown: true,
                  limitCount: maxSessions,
                  usedCount: sessionsUsed,
                  remainingCount: remainingSessions,
                  remainingPercent: Math.min(100, Math.max(0, Math.round((remainingSessions / maxSessions) * 100))),
                  resetAt: weeklyResetAt,
                  source: 'provider'
                })
              }

              const quotaGroups: ProviderQuotaGroup[] = [
                {
                  id: 'claude-gateway-quota',
                  label: 'Claude Gateway Quota',
                  modelIds: account.models ?? [],
                  windows
                }
              ]

              return {
                accountId: account.id,
                accountLabel: account.label,
                accountType: 'api-key',
                tokenLimit: tokenBudget,
                tokensUsed,
                quotaGroups,
                primaryUsedPercent: 100 - remainingPercent,
                resetAt,
                refreshedAt: Date.now(),
                source: 'provider',
                status: 'ok',
                checkUsageUrl
              }
            }
          }
        } catch (err) {
          return {
            accountId: account.id,
            accountLabel: account.label,
            accountType: 'api-key',
            refreshedAt: Date.now(),
            source: 'unavailable',
            status: 'unavailable',
            statusReason: err instanceof Error ? err.message : 'Failed to query quota',
            checkUsageUrl
          }
        }
      }

      return {
        accountId: account.id,
        accountLabel: account.label,
        accountType: 'api-key',
        refreshedAt: Date.now(),
        source: 'unavailable',
        status: 'unavailable',
        statusReason: 'Quota endpoint is not supported for direct Anthropic API keys',
        checkUsageUrl
      }
    },

    quotaGroupForModel(_modelId: string): string | undefined {
      return 'claude-gateway-quota'
    }
  }
}
