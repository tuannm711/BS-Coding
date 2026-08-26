import type { ProviderAccountSnapshot } from '@shared/provider-state'
import type { ProviderQuotaGroup, ProviderQuotaWindow, ProviderUsage } from '@shared/types'

export function remainingPercent(used?: number): number | undefined {
  if (used === undefined || !Number.isFinite(used)) return undefined
  return Math.max(0, Math.min(100, Math.round(100 - used)))
}

export function formatPercent(value?: number): string {
  return value === undefined ? '—' : `${value}%`
}

export function formatCount(value?: number): string {
  return value === undefined ? '—' : value.toLocaleString()
}

export function formatMoney(value?: number): string {
  return value === undefined ? '—' : `$${value.toFixed(4)}`
}

export function formatCountdown(timestamp: number | undefined, now = Date.now()): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return '—'
  const seconds = Math.max(0, Math.round((timestamp - now) / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatInstant(timestamp?: number): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return '—'
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

// A 429 earned by one quota group is stored on the account, so an account-level
// exhaustion warning must not speak for groups that still have quota.
export function hasRemainingQuota(usage?: ProviderUsage): boolean {
  const windows = usage?.quotaGroups?.flatMap(group => group.windows) ?? []
  return windows.some(window => window.usageKnown && (window.remainingPercent ?? 0) > 0)
}

export function accountWarning(usage?: ProviderUsage): string | undefined {
  if (usage?.refreshError) return usage.refreshError
  const reason = usage?.statusReason
  if (!reason) return undefined
  if (/quota exhausted|capacity exhausted/i.test(reason) && hasRemainingQuota(usage)) return undefined
  return reason
}

export function formatExpiry(timestamp: number | undefined, now = Date.now()): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return '—'
  const days = Math.max(0, Math.ceil((timestamp - now) / 86400000))
  const term = timestamp <= now ? 'Expired' : `Term ${days}d`
  return `${term} · ${formatInstant(timestamp)}`
}

export function formatAge(timestamp: number | undefined, now = Date.now()): string {
  if (timestamp === undefined || timestamp <= 0) return '—'
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export function usageRemaining(usage?: ProviderUsage, providerState?: string): { primary?: number; secondary?: number } {
  const primary = providerState === 'quota-exhausted' ? 0 : remainingPercent(usage?.primaryUsedPercent)
  return {
    primary,
    secondary: remainingPercent(usage?.secondaryUsedPercent)
  }
}

export function providerQuotaGroups(usage?: ProviderUsage): ProviderQuotaGroup[] {
  if (!usage) return []
  if (usage.quotaGroups?.length) return usage.quotaGroups
  const windows: ProviderQuotaWindow[] = []
  if (usage.primaryUsedPercent !== undefined || usage.resetAt !== undefined) {
    const value = remainingPercent(usage.primaryUsedPercent)
    windows.push({
      id: 'legacy-primary', label: 'Primary limit', kind: 'unknown',
      ...(value === undefined ? {} : { remainingPercent: value }),
      ...(usage.resetAt === undefined ? {} : { resetAt: usage.resetAt }),
      usageKnown: value !== undefined, source: 'legacy-provider'
    })
  }
  if (usage.secondaryUsedPercent !== undefined || usage.secondaryResetAt !== undefined) {
    const value = remainingPercent(usage.secondaryUsedPercent)
    windows.push({
      id: 'legacy-secondary', label: 'Secondary limit', kind: 'unknown',
      ...(value === undefined ? {} : { remainingPercent: value }),
      ...(usage.secondaryResetAt === undefined ? {} : { resetAt: usage.secondaryResetAt }),
      usageKnown: value !== undefined, source: 'legacy-provider'
    })
  }
  if (windows.length > 0) return [{ id: 'legacy-base', label: 'Quota', modelIds: [], windows }]
  return legacyModelQuotaGroup(usage, Object.keys(usage.modelQuotas ?? {}))
}

export function chatQuotaGroups(usage: ProviderUsage | undefined, modelIds: string[]): ProviderQuotaGroup[] {
  if (!usage) return []
  if (!usage.quotaGroups?.length) {
    const selectedLegacy = legacyModelQuotaGroup(usage, modelIds)
    return selectedLegacy.length > 0 ? selectedLegacy : providerQuotaGroups(usage)
  }
  const families = new Set(modelIds.flatMap(modelId => {
    const normalized = modelId.toLowerCase()
    if (normalized.includes('gemini')) return ['gemini']
    if (normalized.includes('claude') || normalized.includes('gpt') || normalized.startsWith('3p-')) return ['claude-gpt']
    return []
  }))
  return usage.quotaGroups.filter(group =>
    group.modelIds.some(modelId => modelIds.includes(modelId))
    || group.modelIds.length === 0 && (families.size === 0 || !['gemini', 'claude-gpt'].includes(group.id) || families.has(group.id))
  )
}

export function quotaWindowState(window: ProviderQuotaWindow, now = Date.now()): 'ready' | 'exhausted' | 'cooldown' | 'unknown' {
  if (!window.usageKnown || window.remainingPercent === undefined) return 'unknown'
  if (window.remainingPercent > 0) return 'ready'
  return window.resetAt !== undefined && window.resetAt > now ? 'cooldown' : 'exhausted'
}

function legacyModelQuotaGroup(usage: ProviderUsage, modelIds: string[]): ProviderQuotaGroup[] {
  const selected = [...new Set(modelIds)].flatMap(modelId => {
    const quota = usage.modelQuotas?.[modelId]
    return quota ? [{ modelId, quota }] : []
  })
  if (selected.length === 0) return []
  const remainingPercent = Math.min(...selected.map(item => item.quota.remainingPercent))
  const resetAt = selected.map(item => item.quota.resetAt).filter((value): value is number => value !== undefined).sort((a, b) => a - b)[0]
  return [{
    id: 'legacy-models', label: 'Model quota', modelIds: selected.map(item => item.modelId),
    windows: [{
      id: 'legacy-model', label: 'Model quota', kind: 'unknown', remainingPercent,
      ...(resetAt === undefined ? {} : { resetAt }), usageKnown: true, source: 'legacy-provider'
    }]
  }]
}

export function formatProviderAccountType(providerId: string | undefined, authMode: string | undefined): string {
  const name = providerId === 'antigravity' ? 'Antigravity' : providerId === 'openai' ? 'ChatGPT' : providerId ? providerId : 'Provider'
  return authMode === 'oauth' ? `${name} OAuth` : authMode === 'api-key' ? `${name} API key` : `${name} ${authMode ?? 'Account'}`
}

export type QuotaAccountUiState = 'ready' | 'unavailable' | 'quota-exhausted' | 'capacity-exhausted' | 'cooldown' | 'auth-error'

export function quotaAccountState(account: ProviderAccountSnapshot | undefined, now = Date.now()): QuotaAccountUiState {
  if (!account) return 'unavailable'
  if (account.error?.retryAt && account.error.retryAt > now) return 'cooldown'
  if (account.usage?.resetAt && account.usage.resetAt > now && /quota exhausted|capacity exhausted/i.test(account.usage.statusReason ?? '') && !hasRemainingQuota(account.usage)) return 'cooldown'
  const exhausted = !hasRemainingQuota(account.usage)
  if (exhausted && (account.error?.kind === 'quota-exhausted' || account.usage?.statusReason?.toLowerCase().includes('quota exhausted'))) return 'quota-exhausted'
  if (exhausted && (account.error?.kind === 'capacity-exhausted' || account.usage?.statusReason?.toLowerCase().includes('capacity exhausted'))) return 'capacity-exhausted'
  if (account.error?.kind === 'auth' || account.usage?.statusReason?.toLowerCase().includes('authentication')) return 'auth-error'
  if (!account.usage || account.usage.status === 'unavailable') return 'unavailable'
  return 'ready'
}
