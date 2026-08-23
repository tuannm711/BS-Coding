import type { ProviderConnection, ProviderUsage } from './types'

export type ProviderRuntimeKind = 'oauth' | 'api-key' | 'openai-compatible' | 'custom'
export type ProviderModelDiscovery = 'static' | 'account' | 'remote'
export type ProviderUsageCapability = 'supported' | 'unavailable'

export interface ProviderDefinitionSnapshot {
  id: string
  displayName: string
  description: string
  methods: Array<{ id: string; label: string; kind: string; fields: string[]; supportsMultipleAccounts?: boolean }>
  capabilities: {
    modelDiscovery: ProviderModelDiscovery
    runtime: ProviderRuntimeKind
    usage: ProviderUsageCapability
  }
}

export interface ProviderModelRef {
  id: string
  name: string
  discoveredAt: number
  capabilities?: {
    isCodeModel?: boolean
    supportsStreaming?: boolean
    supportsTools?: boolean
    speedModes?: Array<'standard' | 'fast'>
  }
}

export type ProviderErrorKind = 'auth' | 'quota-exhausted' | 'capacity-exhausted' | 'unavailable' | 'invalid-request' | 'unknown'

export interface ProviderErrorState {
  kind: ProviderErrorKind
  message: string
  statusCode?: number
  retryAt?: number
  updatedAt: number
}

export interface ProviderAccountSnapshot {
  id: string
  providerId: string
  label: string
  authMode: 'oauth' | 'api-key' | 'imported'
  status: 'active' | 'disabled' | 'expired' | 'error'
  profile?: { email?: string; name?: string; planName?: string }
  models: ProviderModelRef[]
  usage?: ProviderUsage
  error?: ProviderErrorState
  updatedAt: number
}

export interface AgentAssignmentSnapshot {
  agentId: string
  providerId: string
  accountId?: string
  modelId: string
  speed: 'standard' | 'fast'
  revision: number
  status?: 'ready' | 'needs-review' | 'error'
}

export interface AgentAssignmentSetRequest {
  agentId: string
  providerId: string
  accountId?: string
  modelId: string
  speed: 'standard' | 'fast'
}

export interface ProviderSnapshot {
  revision: number
  providers: ProviderDefinitionSnapshot[]
  connections: ProviderConnection[]
  accounts: ProviderAccountSnapshot[]
  assignments: AgentAssignmentSnapshot[]
  updatedAt: number
}

export function isAssignmentCompatible(assignment: Pick<AgentAssignmentSnapshot, 'providerId' | 'accountId' | 'modelId'>, snapshot: Pick<ProviderSnapshot, 'accounts' | 'providers'>): boolean {
  const account = assignment.accountId ? snapshot.accounts.find(item => item.id === assignment.accountId && item.providerId === assignment.providerId && item.status === 'active') : undefined
  if (assignment.accountId && !account) return false
  const models = account?.models ?? snapshot.accounts.filter(item => item.providerId === assignment.providerId && item.status === 'active').flatMap(item => item.models)
  return Boolean(snapshot.providers.some(provider => provider.id === assignment.providerId) && models.some(model => model.id === assignment.modelId))
}

export function classifyProviderError(statusCode: number | undefined, message: string, now = Date.now()): ProviderErrorState {
  const normalized = message.toLowerCase()
  const kind: ProviderErrorKind = statusCode === 401 || statusCode === 403
    ? 'auth'
    : statusCode === 429 && normalized.includes('resource_exhausted')
      ? 'quota-exhausted'
      : statusCode === 429
        ? 'capacity-exhausted'
        : statusCode === 400
          ? 'invalid-request'
          : statusCode && statusCode >= 500
            ? 'unavailable'
            : 'unknown'
  return { kind, message, statusCode, updatedAt: now }
}

export function shouldAcceptSnapshot(currentRevision: number, nextRevision: number): boolean {
  return nextRevision >= currentRevision
}
