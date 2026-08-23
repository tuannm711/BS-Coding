import type { AuthMethodDescriptor, ProviderCapability, ProviderConnectRequest, ProviderModel } from '../../../shared/providers'
import type { ProviderSecrets } from '../../connections/types'
import type { ProviderAccount } from '../../../shared/types'
import type { ProviderAdapter } from '../types'
import { createLlm } from '../../agent/llm'

const DEFAULT_MODELS: Record<string, string[]> = {
  'github-copilot': ['gpt-4.1', 'claude-sonnet-4'],
  cursor: ['gpt-4.1', 'claude-sonnet-4'],
  windsurf: ['swe-1', 'claude-sonnet-4'],
  kiro: ['claude-sonnet-4'],
  grok: ['grok-4', 'grok-3-mini'],
  codebuddy: ['codebuddy-default'],
  'codebuddy-cn': ['codebuddy-cn-default'],
  qoder: ['qoder-default'],
  trae: ['trae-default'],
  zed: ['zed-default'],
  zcode: ['glm-4.5']
}

function normalizeImported(value: string): ProviderSecrets {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined,
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : undefined,
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined,
      accountId: typeof parsed.accountId === 'string' ? parsed.accountId : undefined
    }
  } catch { throw new Error('[bs] Credential JSON không hợp lệ') }
}

export function createOpenAiCompatibleAdapter(providerId: string, displayName: string, apiKey = false): ProviderAdapter {
  const methods: AuthMethodDescriptor[] = [{ id: 'imported', label: 'Import credentials', description: 'Paste a provider credential JSON with apiKey/accessToken and baseUrl', kind: 'imported', fields: ['credentialJson'], supportsMultipleAccounts: true }]
  if (apiKey) methods.unshift({ id: 'api-key', label: 'API key', description: 'Use an API key and optional OpenAI-compatible base URL', kind: 'api-key' as const, fields: ['apiKey', 'baseUrl'], supportsMultipleAccounts: true })
  const capability: ProviderCapability = { id: providerId, displayName, description: 'Experimental in-app adapter using provider credentials and an OpenAI-compatible endpoint', methods, status: 'experimental' }
  return {
    capability,
    async connect(request: ProviderConnectRequest, context) {
      const secret = request.methodId === 'imported' ? normalizeImported(request.fields.credentialJson ?? '') : { apiKey: request.fields.apiKey, baseUrl: request.fields.baseUrl }
      if (!secret.apiKey && !secret.accessToken) throw new Error('[bs] Credential không có apiKey hoặc accessToken')
      if (!secret.baseUrl) throw new Error('[bs] Credential cần baseUrl OpenAI-compatible')
      const label = request.fields.label?.trim() || `${displayName} account`
      const models = secret.models ?? DEFAULT_MODELS[providerId]
      const account = context.saveAccount({ providerId, label, authMode: request.methodId === 'api-key' ? 'api-key' : 'imported', status: 'active', models, profile: { name: label } }, secret)
      return { account }
    },
    async listModels(account) { return (account.models ?? DEFAULT_MODELS[providerId]).map(id => ({ id, name: id, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } })) as ProviderModel[] },
    createClient(_account, secret, _model) { return createLlm('openai-compatible', secret.apiKey ?? secret.accessToken ?? '', secret.baseUrl) }
  }
}
