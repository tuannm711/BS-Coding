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
  runtimeId?: string
  capabilities?: ProviderModelCapabilities
}

export interface ProviderCapability {
  id: string
  displayName: string
  description?: string
  methods: AuthMethodDescriptor[]
  status: 'ready' | 'experimental' | 'unavailable'
  chatTransport: ProviderChatTransport
  logo?: string
}

export type ProviderChatTransport = 'openai-responses' | 'openai-compatible' | 'cloud-code' | 'codex-app-server' | 'google'

export interface ProviderConnectRequest {
  providerId: string
  methodId: string
  reconnectAccountId?: string
  fields: Record<string, string>
}

export interface ProviderConnectResult {
  accountId?: string
  loginId?: string
  authUrl?: string
  verificationUrl?: string
  userCode?: string
  expiresIn?: number
  requiresBrowser?: boolean
}

export type ProviderAuthorizationStatus = 'waiting' | 'connected' | 'expired' | 'cancelled' | 'error'

export type ProviderAuthorizationErrorKind =
  | 'callback-port-unavailable'
  | 'authorization-expired'
  | 'authorization-cancelled'
  | 'authorization-denied'
  | 'oauth-state-mismatch'
  | 'token-exchange-failed'
  | 'profile-fetch-failed'
  | 'entitlement-missing'
  | 'provider-oauth-unavailable'
  | 'browser-open-failed'

export interface ProviderAuthorizationError {
  kind: ProviderAuthorizationErrorKind
  message: string
}

export interface ProviderAuthorizationRequest {
  providerId: string
  methodId: string
  reconnectAccountId?: string
}

export interface ProviderAuthorizationSession {
  loginId: string
  providerId: string
  methodId: string
  reconnectAccountId?: string
  authUrl: string
  verificationUrl?: string
  userCode?: string
  expiresAt: number
  verifier: string
  expectedState: string
  callbackUrl: string
  status: ProviderAuthorizationStatus
  error?: ProviderAuthorizationError
}

export function providerCanUseMethod(capability: ProviderCapability, methodId: string): boolean {
  return capability.methods.some(method => method.id === methodId)
}

export function providerModelKey(providerId: string, accountId: string, modelId: string): string {
  return `${providerId}/${accountId}/${modelId}`
}

export function sanitizeProviderAuthorizationSession(session: ProviderAuthorizationSession): ProviderAuthorizationSession {
  return {
    ...session,
    verifier: '',
    expectedState: ''
  }
}
