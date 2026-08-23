export type AuthMethodKind = 'oauth' | 'api-key' | 'imported' | 'session'

export interface AuthMethodDescriptor {
  id: string
  label: string
  description: string
  kind: AuthMethodKind
  fields: string[]
  opensBrowser?: boolean
  supportsMultipleAccounts?: boolean
}

export interface ProviderModelCapabilities {
  isCodeModel?: boolean
  supportsStreaming?: boolean
  supportsTools?: boolean
  speedModes?: Array<'standard' | 'fast'>
  contextWindow?: number
  maxOutputTokens?: number
}

export interface ProviderModel {
  id: string
  name: string
  capabilities?: ProviderModelCapabilities
}

export interface ProviderCapability {
  id: string
  displayName: string
  description?: string
  methods: AuthMethodDescriptor[]
  status: 'ready' | 'experimental' | 'unavailable'
  logo?: string
}

export interface ProviderConnectRequest {
  providerId: string
  methodId: string
  fields: Record<string, string>
}

export interface ProviderConnectResult {
  accountId?: string
  loginId?: string
  authUrl?: string
  expiresIn?: number
  requiresBrowser?: boolean
}

export function providerCanUseMethod(capability: ProviderCapability, methodId: string): boolean {
  return capability.status !== 'unavailable' && capability.methods.some(method => method.id === methodId)
}

export function providerModelKey(providerId: string, accountId: string | undefined, modelId: string): string {
  return `${providerId}/${accountId ?? 'default'}/${modelId}`
}
