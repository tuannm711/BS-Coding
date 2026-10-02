import type { ProviderAccount, ProviderQuotaWindow, ProviderUsage } from '../../shared/types'

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function count(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined }
function reset(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function normalizeGitHubCopilotUsage(account: ProviderAccount, payload: unknown, now = Date.now()): ProviderUsage {
  const body = object(payload)
  const rawSnapshots = object(body.quota_snapshots ?? body.quotaSnapshots)
  const resetAt = reset(body.quota_reset_date ?? body.quotaResetDate)
  const windows: ProviderQuotaWindow[] = []
  let creditsUsed: number | undefined
  const tokenBilling = body.token_based_billing === true
  for (const [key, camel, label] of [['premium_interactions', 'premiumInteractions', 'Premium requests'], ['chat', 'chat', 'Chat'], ['completions', 'completions', 'Completions']]) {
    const raw = rawSnapshots[key] ?? rawSnapshots[camel]
    if (!raw || typeof raw !== 'object') continue
    const snapshot = object(raw)
    creditsUsed ??= count(snapshot.credits_used ?? snapshot.creditsUsed)
    const entitlement = snapshot.entitlement ?? snapshot.entitlementRequests
    const unlimited = snapshot.unlimited === true || entitlement === -1
    const limit = unlimited ? undefined : count(entitlement)
    const reportedUsed = count(snapshot.usedRequests ?? snapshot.used_requests)
    const remaining = unlimited ? undefined : count(snapshot.quota_remaining ?? snapshot.remainingRequests) ?? (limit !== undefined && reportedUsed !== undefined && reportedUsed <= limit ? limit - reportedUsed : undefined)
    const used = reportedUsed ?? (limit !== undefined && remaining !== undefined && remaining <= limit ? limit - remaining : undefined)
    const rawPercent = snapshot.percent_remaining ?? snapshot.remainingPercentage
    const reportedPercent = typeof rawPercent === 'number' && Number.isFinite(rawPercent) ? rawPercent : undefined
    const placeholder = tokenBilling && limit === 0 && (remaining === undefined || remaining === 0)
    const percent = unlimited || placeholder ? undefined : reportedPercent ?? (limit !== undefined && limit > 0 && remaining !== undefined ? remaining / limit * 100 : limit !== undefined && limit > 0 && used !== undefined ? (limit - used) / limit * 100 : undefined)
    const windowReset = reset(snapshot.resetDate) ?? resetAt
    windows.push({ id: `copilot-${key}`, label, kind: 'monthly', source: 'provider', informational: true,
      usageKnown: unlimited || percent !== undefined || (!placeholder && remaining !== undefined),
      ...(percent === undefined ? {} : { remainingPercent: Math.max(0, Math.min(100, percent)) }),
      ...(unlimited ? { unlimited: true } : {}),
      ...(placeholder || remaining === undefined ? {} : { remainingCount: remaining }),
      ...(placeholder || limit === undefined ? {} : { limitCount: limit }),
      ...(placeholder || used === undefined ? {} : { usedCount: used }),
      ...(windowReset === undefined ? {} : { resetAt: windowReset }) })
  }
  const premium = windows.find(window => window.id === 'copilot-premium_interactions')
  const hasQuota = windows.some(window => window.usageKnown)
  const plan = typeof body.copilot_plan === 'string' ? body.copilot_plan : account.profile?.planName
  return { accountId: account.id, accountLabel: account.profile?.email ?? account.label, accountType: account.authMode === 'oauth' ? 'oauth' : 'session', refreshedAt: now,
    source: hasQuota || creditsUsed !== undefined ? 'provider' : 'unavailable', status: hasQuota || creditsUsed !== undefined ? 'ok' : 'unavailable',
    ...(plan ? { planName: plan } : {}), ...(resetAt === undefined ? {} : { resetAt }),
    ...(premium?.remainingPercent === undefined ? {} : { primaryUsedPercent: 100 - premium.remainingPercent }),
    ...(premium?.usedCount === undefined ? {} : { requestsUsed: premium.usedCount }), ...(premium?.limitCount === undefined ? {} : { requestLimit: premium.limitCount }),
    ...(creditsUsed === undefined ? {} : { creditsUsed }),
    ...(windows.length ? { quotaGroups: [{ id: 'account', label: 'Copilot entitlement', modelIds: [], windows }] } : {}),
    ...(!hasQuota && creditsUsed === undefined ? { statusReason: 'GitHub did not report account quota or credit usage' } : {}) }
}
