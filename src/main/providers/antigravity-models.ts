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

interface CanonicalAntigravityModel {
  id: string
  displayName: string
  modelConstant: string
  aliases: string[]
}

const CANONICAL_MODELS: CanonicalAntigravityModel[] = [
  { id: 'gemini-3.1-pro-high', displayName: 'Gemini 3.1 Pro (High)', modelConstant: 'MODEL_PLACEHOLDER_M37', aliases: ['gemini-3-pro-high', 'MODEL_PLACEHOLDER_M8'] },
  { id: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro (Low)', modelConstant: 'MODEL_PLACEHOLDER_M36', aliases: ['gemini-3-pro-low', 'MODEL_PLACEHOLDER_M7'] },
  { id: 'gemini-3-flash', displayName: 'Gemini 3 Flash', modelConstant: 'MODEL_PLACEHOLDER_M18', aliases: [] },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6 (Thinking)', modelConstant: 'MODEL_PLACEHOLDER_M35', aliases: ['claude-sonnet-4-6-thinking', 'claude-sonnet-4-5', 'claude-sonnet-4-5-thinking'] },
  { id: 'claude-opus-4-6-thinking', displayName: 'Claude Opus 4.6 (Thinking)', modelConstant: 'MODEL_PLACEHOLDER_M26', aliases: ['claude-opus-4-6', 'claude-opus-4-5-thinking', 'MODEL_PLACEHOLDER_M12'] },
  { id: 'gpt-oss-120b-medium', displayName: 'GPT-OSS 120B (Medium)', modelConstant: 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM', aliases: [] }
]

const CANONICAL_BY_ALIAS = new Map(CANONICAL_MODELS.flatMap(model =>
  [model.id, model.displayName, model.modelConstant, ...model.aliases].map(alias => [normalizeIdentity(alias), model] as const)
))

export function parseAntigravityModels(payload: unknown): ProviderModel[] {
  const models = (payload as { models?: Record<string, CloudCodeModel> })?.models ?? {}
  return Object.entries(models).map(([key, value]) => {
    const canonical = resolveCanonicalModel(key, value.model, value.displayName)
    const transportId = [key, value.model].find(candidate => candidate && /^MODEL_/i.test(candidate))
      ?? key
    const persistedCandidate = [value.model, key].find(candidate => candidate && !/^MODEL_/i.test(candidate))
      ?? value.model
      ?? key
    return {
      id: canonical?.id ?? canonicalAntigravityModelId(persistedCandidate),
      runtimeId: transportId,
      name: value.displayName ?? canonical?.displayName ?? persistedCandidate,
      capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true }
    }
  })
}

export function canonicalAntigravityModelId(id: string): string {
  const trimmed = id.trim()
  return CANONICAL_BY_ALIAS.get(normalizeIdentity(trimmed))?.id ?? trimmed
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
  if (known.length === 0) return { accountId, ...metadata, quotaGroups, refreshedAt: now, source: 'unavailable', status: 'unavailable', statusReason: 'No quota data returned by Cloud Code' }
  const remaining = Math.min(...known)
  const resetAt = earliestReset(quotaGroups.flatMap(group => group.windows).map(window => window.resetAt))
  return {
    accountId,
    ...metadata,
    quotaGroups,
    refreshedAt: now,
    source: 'provider',
    status: 'ok',
    primaryUsedPercent: 100 - remaining,
    ...(resetAt === undefined ? {} : { resetAt }),
    ...(remaining === 0 ? { statusReason: 'Quota exhausted' } : {})
  }
}

export function parseAntigravityUsage(accountId: string, payload: unknown, metadata: UsageMetadata = {}, now = Date.now()): ProviderUsage {
  const entries = Object.entries((payload as { models?: Record<string, CloudCodeModel> })?.models ?? {})
  const classified = entries.flatMap(([key, model]) => {
    const modelId = canonicalAntigravityModelId(model.model ?? key)
    const groupId = antigravityQuotaGroupForModel(modelId)
    return groupId ? [{ modelId, groupId, quota: model.quotaInfo }] : []
  })
  const allQuotas = entries.map(([, model]) => model.quotaInfo).filter((quota): quota is NonNullable<CloudCodeModel['quotaInfo']> => quota?.remainingFraction !== undefined)
  const groupedQuotas = classified.flatMap(item => item.quota?.remainingFraction === undefined ? [] : [item.quota])
  const quotas = groupedQuotas.length > 0 ? groupedQuotas : allQuotas
  if (quotas.length === 0) return { accountId, ...metadata, refreshedAt: now, source: 'unavailable', status: 'unavailable', statusReason: 'No quota data returned by Cloud Code' }
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
  return { accountId, ...metadata, refreshedAt: now, source: 'provider', status: 'ok', primaryUsedPercent: 100 - fractionPercent(remaining), ...(resetAt === undefined ? {} : { resetAt }), modelQuotas, quotaGroups, ...(remaining === 0 ? { statusReason: 'Quota exhausted' } : {}) }
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
  // label before description. Cloud Code's description is a whole sentence —
  // "You have used some of your weekly limit, it will fully refresh in 3 days"
  // — and using it as the label made every window three lines tall for one
  // fact the percentage and countdown beside it already stated.
  const label = bucket.label ?? (kind === 'weekly' ? 'Weekly' : kind === 'session' ? '5-hour' : 'Quota')
  if (remainingPercent === undefined && resetAt === undefined) return undefined
  return { id, label, ...(bucket.description === undefined ? {} : { description: bucket.description }), kind, ...(remainingPercent === undefined ? {} : { remainingPercent }), ...(resetAt === undefined ? {} : { resetAt }), usageKnown: remainingPercent !== undefined, source: 'provider' }
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

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function resolveCanonicalModel(...identities: Array<string | undefined>): CanonicalAntigravityModel | undefined {
  for (const identity of identities) {
    if (!identity) continue
    const found = CANONICAL_BY_ALIAS.get(normalizeIdentity(identity))
    if (found) return found
  }
  return undefined
}
