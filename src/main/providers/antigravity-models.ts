import type { ProviderModel } from '../../shared/providers'
import type { ProviderQuotaGroup, ProviderQuotaWindow, ProviderUsage } from '../../shared/types'

interface CloudCodeModel {
  displayName?: string
  model?: string
  quotaInfo?: { remainingFraction?: number; resetTime?: string }
}

type UsageMetadata = Pick<ProviderUsage, 'accountLabel' | 'accountType' | 'planName'>

interface CloudCodeQuotaBucket {
  bucketId?: string
  description?: string
  label?: string
  window?: string | number
  resetTime?: string | number
  remaining?: { remainingFraction?: number }
  remainingFraction?: number
  modelIds?: string[]
  models?: string[]
}

interface CloudCodeQuotaGroup {
  id?: string
  displayName?: string
  name?: string
  buckets?: CloudCodeQuotaBucket[]
}

export function parseAntigravityModels(payload: unknown): ProviderModel[] {
  const models = (payload as { models?: Record<string, CloudCodeModel> })?.models ?? {}
  return Object.entries(models).map(([key, value]) => ({ id: value.model ?? key, runtimeId: key, name: value.displayName ?? key, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }))
}

export function canonicalAntigravityModelId(id: string): string {
  return id.trim()
}

export function antigravityQuotaGroupForModel(id: string): 'gemini' | 'claude-gpt' | undefined {
  const normalized = canonicalAntigravityModelId(id).toLowerCase()
  if (/autocomplete|(?:^|[-_.])lite(?:$|[-_.])|image|vision|embedding|hidden/.test(normalized)) return undefined
  if (normalized.includes('gemini')) return 'gemini'
  if (normalized.includes('claude') || normalized.includes('gpt') || normalized.startsWith('3p-')) return 'claude-gpt'
  return undefined
}

export function hasKnownAntigravityQuota(payload: unknown): boolean {
  const groups = quotaGroupsFrom(payload)
  if (groups.some(group => (group.buckets ?? []).some(bucket => bucketFraction(bucket) !== undefined))) return true
  return Object.values((payload as { models?: Record<string, CloudCodeModel> })?.models ?? {})
    .some(model => model.quotaInfo?.remainingFraction !== undefined)
}

export function parseAntigravityQuotaSummary(accountId: string, payload: unknown, metadata: UsageMetadata = {}, now = Date.now()): ProviderUsage {
  const rawGroups = quotaGroupsFrom(payload)
  if (rawGroups.length === 0) return parseAntigravityUsage(accountId, payload, metadata, now)
  const quotaGroups = rawGroups.flatMap((group, groupIndex) => {
    const id = quotaGroupId(group)
    if (!id) return []
    const windows = (group.buckets ?? []).map((bucket, bucketIndex) => quotaBucketWindow(bucket, id, bucketIndex)).filter((window): window is ProviderQuotaWindow => Boolean(window))
    if (windows.length === 0) return []
    const modelIds = [...new Set((group.buckets ?? []).flatMap(bucket => bucket.modelIds ?? bucket.models ?? []).map(canonicalAntigravityModelId))]
    return [{
      id,
      label: group.displayName ?? group.name ?? (id === 'gemini' ? 'Gemini Models' : 'Claude and GPT models'),
      modelIds,
      windows
    } satisfies ProviderQuotaGroup]
  })
  const known = quotaGroups.flatMap(group => group.windows).flatMap(window => window.remainingPercent === undefined ? [] : [window.remainingPercent])
  if (known.length === 0) return { accountId, ...metadata, quotaGroups, refreshedAt: now, source: 'unavailable', status: 'unavailable', unavailableReason: 'No quota data returned by Cloud Code' }
  const remaining = Math.min(...known)
  const resetAt = earliestReset(quotaGroups.flatMap(group => group.windows).map(window => window.resetAt))
  return {
    accountId,
    ...metadata,
    quotaGroups,
    refreshedAt: now,
    source: 'provider',
    status: remaining <= 20 ? 'near-limit' : 'ok',
    primaryUsedPercent: 100 - remaining,
    ...(resetAt === undefined ? {} : { resetAt }),
    ...(remaining === 0 ? { unavailableReason: 'Quota exhausted' } : {})
  }
}

export function parseAntigravityUsage(accountId: string, payload: unknown, metadata: UsageMetadata = {}, now = Date.now()): ProviderUsage {
  const entries = Object.entries((payload as { models?: Record<string, CloudCodeModel> })?.models ?? {})
  const classified = entries.flatMap(([key, model]) => {
    const modelId = canonicalAntigravityModelId(model.model ?? key)
    const groupId = antigravityQuotaGroupForModel(modelId)
    return groupId ? [{ modelId, groupId, quota: model.quotaInfo }] : []
  })
  const quotas = entries.map(([, model]) => model.quotaInfo).filter((quota): quota is NonNullable<CloudCodeModel['quotaInfo']> => quota?.remainingFraction !== undefined)
  if (quotas.length === 0) return { accountId, ...metadata, refreshedAt: now, source: 'unavailable', status: 'unavailable', unavailableReason: 'No quota data returned by Cloud Code' }
  const remaining = Math.max(0, Math.min(1, Math.min(...quotas.map(quota => quota.remainingFraction ?? 0))))
  const resetAt = earliestReset(quotas.map(quota => parseReset(quota.resetTime)))
  const modelQuotas = Object.fromEntries(entries.flatMap(([key, model]) => {
    const modelId = canonicalAntigravityModelId(model.model ?? key)
    const fraction = model.quotaInfo?.remainingFraction
    if (fraction === undefined) return []
    const parsedReset = parseReset(model.quotaInfo?.resetTime)
    return [[modelId, { remainingPercent: fractionPercent(fraction), ...(parsedReset && Number.isFinite(parsedReset) ? { resetAt: parsedReset } : {}) }]]
  }))
  const quotaGroups = (['gemini', 'claude-gpt'] as const).flatMap(groupId => {
    const members = classified.filter(item => item.groupId === groupId)
    if (members.length === 0) return []
    const known = members.flatMap(item => item.quota?.remainingFraction === undefined ? [] : [fractionPercent(item.quota.remainingFraction)])
    const groupReset = earliestReset(members.map(item => parseReset(item.quota?.resetTime)))
    const window: ProviderQuotaWindow = {
      id: `${groupId}-session`,
      label: 'Session',
      kind: 'session',
      ...(known.length === 0 ? {} : { remainingPercent: Math.min(...known) }),
      ...(groupReset === undefined ? {} : { resetAt: groupReset }),
      usageKnown: known.length > 0,
      source: 'provider'
    }
    return [{ id: groupId, label: groupId === 'gemini' ? 'Gemini Models' : 'Claude and GPT models', modelIds: members.map(item => item.modelId), windows: [window] } satisfies ProviderQuotaGroup]
  })
  return { accountId, ...metadata, refreshedAt: now, source: 'provider', status: remaining <= 0.2 ? 'near-limit' : 'ok', primaryUsedPercent: (1 - remaining) * 100, ...(resetAt === undefined ? {} : { resetAt }), modelQuotas, quotaGroups, ...(remaining === 0 ? { unavailableReason: 'Quota exhausted' } : {}) }
}

function quotaGroupsFrom(payload: unknown): CloudCodeQuotaGroup[] {
  const value = payload as { groups?: CloudCodeQuotaGroup[]; response?: { groups?: CloudCodeQuotaGroup[] } }
  return value.response?.groups ?? value.groups ?? []
}

function quotaGroupId(group: CloudCodeQuotaGroup): 'gemini' | 'claude-gpt' | undefined {
  const identity = `${group.id ?? ''} ${group.displayName ?? ''} ${group.name ?? ''} ${(group.buckets ?? []).map(bucket => bucket.bucketId).join(' ')}`.toLowerCase()
  if (identity.includes('gemini')) return 'gemini'
  if (identity.includes('claude') || identity.includes('gpt') || identity.includes('3p-')) return 'claude-gpt'
  return undefined
}

function bucketFraction(bucket: CloudCodeQuotaBucket): number | undefined {
  return bucket.remaining?.remainingFraction ?? bucket.remainingFraction
}

function quotaBucketWindow(bucket: CloudCodeQuotaBucket, groupId: string, index: number): ProviderQuotaWindow | undefined {
  const id = bucket.bucketId?.trim() || `${groupId}-${index + 1}`
  const identity = `${id} ${bucket.description ?? ''} ${bucket.label ?? ''} ${bucket.window ?? ''}`.toLowerCase()
  const kind: ProviderQuotaWindow['kind'] = identity.includes('weekly') || identity.includes('week')
    ? 'weekly'
    : identity.includes('5h') || identity.includes('5-hour') || identity.includes('session')
      ? 'session'
      : 'unknown'
  const fraction = bucketFraction(bucket)
  const remainingPercent = fraction === undefined ? undefined : fractionPercent(fraction)
  const resetAt = parseReset(bucket.resetTime)
  const label = bucket.description ?? bucket.label ?? (kind === 'weekly' ? 'Weekly' : kind === 'session' ? '5-hour' : 'Quota')
  if (remainingPercent === undefined && resetAt === undefined) return undefined
  return { id, label, kind, ...(remainingPercent === undefined ? {} : { remainingPercent }), ...(resetAt === undefined ? {} : { resetAt }), usageKnown: remainingPercent !== undefined, source: 'provider' }
}

function parseReset(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function earliestReset(values: Array<number | undefined>): number | undefined {
  return values.filter((value): value is number => value !== undefined && Number.isFinite(value)).sort((a, b) => a - b)[0]
}

function fractionPercent(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 10_000) / 100
}
