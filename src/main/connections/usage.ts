import type { ProviderAccount, ProviderUsage } from '../../shared/types'

export interface UsageAdapter {
  supports(providerId: string): boolean
  fetch(account: ProviderAccount, secret: { accessToken?: string; apiKey?: string }): Promise<ProviderUsage>
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

export function normalizeOpenAICodexUsage(accountId: string, raw: unknown): ProviderUsage {
  const value = raw as {
    usage?: { requests?: number; tokens?: number }
    limit?: { requests?: number; tokens?: number }
    reset_at?: number
    plan_type?: string
    planName?: string
    subscription_expires_at?: number
    primary_window?: WindowUsage
    secondary_window?: WindowUsage
    banked?: { used?: number; limit?: number }
    rate_limit?: { primary_window?: WindowUsage; secondary_window?: WindowUsage }
    rate_limits?: { primary?: WindowUsage; secondary?: WindowUsage }
  }
  // ChatGPT's current endpoint wraps the windows in `rate_limit`; older
  // snapshots used `rate_limits` or placed them at the response root.
  const primary = value.primary_window ?? value.rate_limit?.primary_window ?? value.rate_limits?.primary
  const secondary = value.secondary_window ?? value.rate_limit?.secondary_window ?? value.rate_limits?.secondary
  const tokensUsed = value.usage?.tokens ?? (primary?.used_percent !== undefined && primary.limit ? Math.round(primary.limit * primary.used_percent / 100) : undefined)
  const resetAt = value.reset_at ?? primary?.reset_at ?? (primary?.reset_after_seconds !== undefined ? Date.now() + primary.reset_after_seconds * 1000 : undefined)
  const secondaryResetAt = secondary?.reset_at ?? (secondary?.reset_after_seconds !== undefined ? Date.now() + secondary.reset_after_seconds * 1000 : undefined)
  return normalizeUsage({
    accountId,
    requestsUsed: value.usage?.requests,
    requestLimit: value.limit?.requests,
    tokensUsed,
    tokenLimit: value.limit?.tokens ?? primary?.limit,
    resetAt,
    secondaryResetAt,
    bankedUsed: value.banked?.used,
    bankedLimit: value.banked?.limit,
    primaryUsedPercent: primary?.used_percent,
    secondaryUsedPercent: secondary?.used_percent,
    subscriptionExpiresAt: value.subscription_expires_at,
    planName: value.plan_type ?? value.planName,
    source: 'provider'
  })
}

interface WindowUsage {
  used_percent?: number
  reset_at?: number
  reset_after_seconds?: number
  limit_window_seconds?: number
  limit?: number
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
