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
  const value = raw as { usage?: { requests?: number; tokens?: number }; limit?: { requests?: number; tokens?: number }; reset_at?: number; plan_type?: string; planName?: string; subscription_expires_at?: number; primary_window?: { used_percent?: number; reset_at?: number; limit?: number }; secondary_window?: { used_percent?: number; reset_at?: number; limit?: number }; banked?: { used?: number; limit?: number }; rate_limits?: { primary?: { used_percent?: number; reset_at?: number; limit?: number }; secondary?: { used_percent?: number; reset_at?: number; limit?: number } } }
  const primary = value.primary_window ?? value.rate_limits?.primary
  const secondary = value.secondary_window ?? value.rate_limits?.secondary
  const tokensUsed = value.usage?.tokens ?? (primary?.used_percent !== undefined && primary.limit ? Math.round(primary.limit * primary.used_percent / 100) : undefined)
  return normalizeUsage({
    accountId,
    requestsUsed: value.usage?.requests,
    requestLimit: value.limit?.requests,
    tokensUsed,
    tokenLimit: value.limit?.tokens ?? primary?.limit,
    resetAt: value.reset_at ?? primary?.reset_at,
    bankedUsed: value.banked?.used,
    bankedLimit: value.banked?.limit,
    primaryUsedPercent: primary?.used_percent,
    secondaryUsedPercent: secondary?.used_percent,
    subscriptionExpiresAt: value.subscription_expires_at,
    source: 'provider'
  })
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
