import type { ProviderAccount, ProviderQuotaGroup, ProviderQuotaWindow, ProviderUsage } from '../../shared/types'
import type { UsagePeriod } from './usage-ledger'

export interface UsageAdapter {
  supports(providerId: string): boolean
  fetch(account: ProviderAccount, secret: { accessToken?: string; apiKey?: string }): Promise<ProviderUsage>
}

export function normalizeResetAt(value: number | string | undefined, now = Date.now(), resetAfterSeconds?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return resetAfterSeconds === undefined ? undefined : now + resetAfterSeconds * 1000
}

export function toRemainingPercent(usedPercent: number | undefined): number | undefined {
  return usedPercent === undefined || !Number.isFinite(usedPercent)
    ? undefined
    : Math.max(0, Math.min(100, 100 - usedPercent))
}

export function selectTrackedPeriod(usage: ProviderUsage | undefined, firstObservedAt: number): UsagePeriod {
  const windows = usage?.quotaGroups?.flatMap(group => group.windows) ?? []
  const preferred = windows.find(window => window.kind === 'weekly' && window.resetAt !== undefined)
    ?? windows.find(window => window.kind === 'monthly' && window.resetAt !== undefined)
    ?? [...windows].filter(window => window.resetAt !== undefined).sort((a, b) => (b.windowMinutes ?? 0) - (a.windowMinutes ?? 0))[0]
  if (!preferred?.resetAt) return { key: `local:${firstObservedAt}`, start: firstObservedAt }
  const start = preferred.windowMinutes === undefined
    ? firstObservedAt
    : preferred.resetAt - preferred.windowMinutes * 60_000
  return { key: `${preferred.kind}:${preferred.resetAt}`, start, end: preferred.resetAt }
}

export function retainLastKnownUsage(previous: ProviderUsage, error: unknown, now = Date.now()): ProviderUsage {
  return {
    ...previous,
    refreshedAt: now,
    lastSuccessfulRefreshAt: previous.lastSuccessfulRefreshAt ?? previous.refreshedAt,
    stale: true,
    refreshError: String(error)
  }
}

export function normalizeUsage(input: Partial<ProviderUsage> & Pick<ProviderUsage, 'accountId'>): ProviderUsage {
  const limit = input.tokenLimit ?? 0
  const used = input.tokensUsed ?? 0
  const ratio = limit > 0 ? used / limit : 0
  const percent = input.primaryUsedPercent ?? (ratio * 100)
  return {
    ...input,
    refreshedAt: input.refreshedAt ?? Date.now(),
    source: input.source ?? 'provider',
    status: input.status ?? (input.subscriptionExpiresAt && input.subscriptionExpiresAt <= Date.now() ? 'expired' : percent >= 90 ? 'near-limit' : 'ok')
  }
}

export function normalizeOpenAICodexUsage(accountId: string, raw: unknown, now = Date.now()): ProviderUsage {
  const value = raw as {
    usage?: { requests?: number; tokens?: number; input_tokens?: number; output_tokens?: number; inputTokens?: number; outputTokens?: number }
    limit?: { requests?: number; tokens?: number }
    reset_at?: number
    plan_type?: string
    planName?: string
    subscription_expires_at?: number | string
    primary_window?: WindowUsage
    secondary_window?: WindowUsage
    banked?: { used?: number; limit?: number }
    rate_limit?: { primary_window?: WindowUsage; secondary_window?: WindowUsage }
    rate_limits?: { primary?: WindowUsage; secondary?: WindowUsage }
    additional_rate_limits?: AdditionalRateLimit[]
  }
  // ChatGPT's current endpoint wraps the windows in `rate_limit`; older
  // snapshots used `rate_limits` or placed them at the response root.
  const primary = value.primary_window ?? value.rate_limit?.primary_window ?? value.rate_limits?.primary
  const secondary = value.secondary_window ?? value.rate_limit?.secondary_window ?? value.rate_limits?.secondary
  const tokensUsed = value.usage?.tokens ?? (primary?.used_percent !== undefined && primary.limit ? Math.round(primary.limit * primary.used_percent / 100) : undefined)
  const resetAt = normalizeResetAt(value.reset_at ?? primary?.reset_at, now, primary?.reset_after_seconds)
  const secondaryResetAt = normalizeResetAt(secondary?.reset_at, now, secondary?.reset_after_seconds)
  const baseWindows = [
    primary ? openAiWindow('primary', primary, now, false) : undefined,
    secondary ? openAiWindow('secondary', secondary, now, false) : undefined
  ].filter((window): window is ProviderQuotaWindow => Boolean(window))
  const quotaGroups: ProviderQuotaGroup[] = baseWindows.length > 0
    ? [{ id: 'openai-base', label: 'Codex', modelIds: [], windows: baseWindows }]
    : []
  for (const [index, additional] of (value.additional_rate_limits ?? []).entries()) {
    const label = additional.limit_name ?? additional.name ?? additional.label ?? `Additional limit ${index + 1}`
    const key = slug(additional.id ?? label) || `additional-${index + 1}`
    const rateLimit = additional.rate_limit ?? additional
    const windows = [
      rateLimit.primary_window ? openAiWindow(`${key}-primary`, rateLimit.primary_window, now, true) : undefined,
      rateLimit.secondary_window ? openAiWindow(`${key}-secondary`, rateLimit.secondary_window, now, true) : undefined
    ].filter((window): window is ProviderQuotaWindow => Boolean(window))
    if (windows.length > 0) quotaGroups.push({ id: `openai-${key}`, label, modelIds: [], windows })
  }
  return normalizeUsage({
    accountId,
    requestsUsed: value.usage?.requests,
    requestLimit: value.limit?.requests,
    tokensUsed,
    tokensInput: value.usage?.input_tokens ?? value.usage?.inputTokens,
    tokensOutput: value.usage?.output_tokens ?? value.usage?.outputTokens,
    tokenLimit: value.limit?.tokens ?? primary?.limit,
    resetAt,
    secondaryResetAt,
    bankedUsed: value.banked?.used,
    bankedLimit: value.banked?.limit,
    primaryUsedPercent: primary?.used_percent,
    secondaryUsedPercent: secondary?.used_percent,
    subscriptionExpiresAt: normalizeResetAt(value.subscription_expires_at, now),
    planName: value.plan_type ?? value.planName,
    quotaGroups,
    source: 'provider'
  })
}

export function extractOpenAISubscriptionMetadata(raw: unknown): Pick<ProviderUsage, 'planName' | 'subscriptionExpiresAt'> {
  const found: { planName?: string; subscriptionExpiresAt?: number } = {}
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || found.planName && found.subscriptionExpiresAt) return
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (!found.planName && ['plan_type', 'planType', 'plan_name', 'planName'].includes(key) && typeof child === 'string' && child.trim()) found.planName = child
      if (!found.subscriptionExpiresAt && ['subscription_active_until', 'subscriptionExpiresAt', 'subscription_expires_at', 'end_date', 'ends_at'].includes(key)) {
        const parsed = typeof child === 'number' ? child : typeof child === 'string' ? Date.parse(child) : NaN
        if (Number.isFinite(parsed)) found.subscriptionExpiresAt = parsed > 10_000_000_000 ? parsed : parsed * 1000
      }
      visit(child)
    }
  }
  visit(raw)
  return found
}

interface WindowUsage {
  used_percent?: number
  reset_at?: number | string
  reset_after_seconds?: number
  limit_window_seconds?: number
  limit?: number
  label?: string
  name?: string
  description?: string
}

interface AdditionalRateLimit {
  id?: string
  limit_name?: string
  name?: string
  label?: string
  rate_limit?: { primary_window?: WindowUsage; secondary_window?: WindowUsage }
  primary_window?: WindowUsage
  secondary_window?: WindowUsage
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function openAiWindow(id: string, input: WindowUsage, now: number, additional: boolean): ProviderQuotaWindow {
  const windowMinutes = input.limit_window_seconds === undefined ? undefined : input.limit_window_seconds / 60
  const resetAt = normalizeResetAt(input.reset_at, now, input.reset_after_seconds)
  const label = additional
    ? input.label ?? input.name ?? input.description ?? 'Additional limit'
    : windowMinutes === 300
      ? '5-hour'
      : windowMinutes === 10_080
        ? 'Weekly'
        : input.label ?? input.name ?? input.description ?? (id === 'secondary' ? 'Weekly' : 'Session')
  const kind: ProviderQuotaWindow['kind'] = additional
    ? 'additional'
    : windowMinutes === 10_080 || id === 'secondary'
      ? 'weekly'
      : 'session'
  const remainingPercent = toRemainingPercent(input.used_percent)
  return {
    id,
    label,
    kind,
    ...(remainingPercent === undefined ? {} : { remainingPercent }),
    ...(resetAt === undefined ? {} : { resetAt }),
    ...(windowMinutes === undefined ? {} : { windowMinutes }),
    usageKnown: remainingPercent !== undefined,
    source: 'provider'
  }
}

export class UsageScheduler {
  private timer: ReturnType<typeof setInterval> | null = null

  start(refresh: () => void, intervalMs = 45 * 60 * 1000): void {
    this.stop()
    this.timer = setInterval(refresh, intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
