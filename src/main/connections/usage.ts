import type { ProviderAccount, ProviderUsage } from '../../shared/types'

export interface UsageAdapter {
  supports(providerId: string): boolean
  fetch(account: ProviderAccount, secret: { accessToken?: string; apiKey?: string }): Promise<ProviderUsage>
}

export function normalizeUsage(input: Partial<ProviderUsage> & Pick<ProviderUsage, 'accountId'>): ProviderUsage {
  const limit = input.tokenLimit ?? 0
  const used = input.tokensUsed ?? 0
  const ratio = limit > 0 ? used / limit : 0
  return {
    ...input,
    refreshedAt: input.refreshedAt ?? Date.now(),
    source: input.source ?? 'provider',
    status: input.status ?? (input.subscriptionExpiresAt && input.subscriptionExpiresAt <= Date.now() ? 'expired' : ratio >= 0.9 ? 'near-limit' : 'ok')
  }
}

export function normalizeOpenAICodexUsage(accountId: string, raw: unknown): ProviderUsage {
  const value = raw as { usage?: { requests?: number; tokens?: number }; limit?: { requests?: number; tokens?: number }; reset_at?: number; plan_type?: string; subscription_expires_at?: number }
  return normalizeUsage({
    accountId,
    requestsUsed: value.usage?.requests,
    requestLimit: value.limit?.requests,
    tokensUsed: value.usage?.tokens,
    tokenLimit: value.limit?.tokens,
    resetAt: value.reset_at,
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
