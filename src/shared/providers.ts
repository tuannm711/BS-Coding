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
  /** Provider transport identifier when it differs from the persisted assignment id. */
  runtimeId?: string
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
  reconnectAccountId?: string
  fields: Record<string, string>
}

export interface ProviderConnectResult {
  accountId?: string
  loginId?: string
  authUrl?: string
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
  authUrl: string
  expiresAt: number
  status: ProviderAuthorizationStatus
  accountId?: string
  error?: ProviderAuthorizationError
}

export function sanitizeProviderAuthorizationSession(
  session: ProviderAuthorizationSession & Record<string, unknown>
): ProviderAuthorizationSession {
  const { loginId, providerId, methodId, authUrl, expiresAt, status, accountId, error } = session
  return {
    loginId,
    providerId,
    methodId,
    authUrl,
    expiresAt,
    status,
    ...(accountId ? { accountId } : {}),
    ...(error ? { error } : {})
  }
}

export function providerCanUseMethod(capability: ProviderCapability, methodId: string): boolean {
  return capability.status !== 'unavailable' && capability.methods.some(method => method.id === methodId)
}

export function providerModelKey(providerId: string, accountId: string | undefined, modelId: string): string {
  return `${providerId}/${accountId ?? 'default'}/${modelId}`
}
