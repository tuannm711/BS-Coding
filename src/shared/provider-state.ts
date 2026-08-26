import type { ProviderErrorKind, ProviderErrorState, ProviderRefreshStages, ProviderUsage } from './types'
export type { ProviderErrorKind, ProviderErrorState } from './types'
import type { AuthMethodKind } from './providers'

export type ProviderRuntimeKind = 'oauth' | 'api-key' | 'openai-compatible' | 'custom'
export type ProviderModelDiscovery = 'static' | 'account' | 'remote'
export type ProviderUsageCapability = 'supported' | 'unavailable'

export interface ProviderDefinitionSnapshot {
  id: string
  displayName: string
  description: string
  methods: Array<{ id: string; label: string; description?: string; kind: AuthMethodKind; fields: string[]; opensBrowser?: boolean; supportsMultipleAccounts?: boolean }>
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
  poolErrors?: Record<string, ProviderErrorState>
  refreshStages?: ProviderRefreshStages
  updatedAt: number
}

export interface AgentAssignmentSnapshot {
  agentId: string
  profileName?: string
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

// A runtime error arrives as a formatted string, not as a response object, so
// the status code has to be read back out of it. One definition: the manager
// that records the error and the manager that routes around it must agree on
// what a message means.
export function classifyRuntimeError(message: string, now = Date.now()): ProviderErrorState {
  const statusCode = Number(message.match(/\((\d{3})\)/)?.[1]) || undefined
  const retryAfter = Number(message.match(/retry-after[=:]\s*(\d+)/i)?.[1]) || 0
  const error = classifyProviderError(statusCode, message, now)
  if (retryAfter > 0) error.retryAt = now + retryAfter * 1000
  return error
}

export function classifyProviderError(statusCode: number | undefined, message: string, now = Date.now()): ProviderErrorState {
  const normalized = message.toLowerCase()
  const capacity = normalized.includes('capacity') || normalized.includes('model_out_of_compute') || normalized.includes('out_of_compute')
  // A length rejection is recoverable by compacting and retrying, so it must be
  // distinguishable from every other bad request. Providers word it differently
  // and a stream error may carry no status code at all.
  const overflow = normalized.includes('context_length_exceeded')
    || normalized.includes('maximum context length')
    || normalized.includes('too many tokens')
    || normalized.includes('prompt is too long')
  const kind: ProviderErrorKind = statusCode === 401 || statusCode === 403
    ? 'auth'
    : statusCode === 404 && (normalized.includes('not_found') || normalized.includes('not found'))
      ? 'runtime-entity-not-found'
    : (statusCode === 429 || statusCode === 503) && capacity
      ? 'capacity-exhausted'
      : statusCode === 429 && (normalized.includes('resource_exhausted') || normalized.includes('quota'))
      ? 'quota-exhausted'
      : statusCode === 429
        ? 'capacity-exhausted'
        : overflow
          ? 'context-overflow'
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
