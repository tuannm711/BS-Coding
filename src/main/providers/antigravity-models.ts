import type { ProviderModel } from '../../shared/providers'
import type { ProviderUsage } from '../../shared/types'

interface CloudCodeModel {
  displayName?: string
  model?: string
  quotaInfo?: { remainingFraction?: number; resetTime?: string }
}

export function parseAntigravityModels(payload: unknown): ProviderModel[] {
  const models = (payload as { models?: Record<string, CloudCodeModel> })?.models ?? {}
  return Object.entries(models).map(([key, value]) => ({ id: value.model ?? key, name: value.displayName ?? value.model ?? key, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }))
}

export function parseAntigravityUsage(accountId: string, payload: unknown, metadata: Pick<ProviderUsage, 'accountLabel' | 'accountType' | 'planName'> = {}, now = Date.now()): ProviderUsage {
  const models = Object.values((payload as { models?: Record<string, CloudCodeModel> })?.models ?? {})
  const quotas = models.map(model => model.quotaInfo).filter((quota): quota is NonNullable<CloudCodeModel['quotaInfo']> => quota?.remainingFraction !== undefined)
  if (quotas.length === 0) return { accountId, ...metadata, refreshedAt: now, source: 'unavailable', status: 'unavailable', unavailableReason: 'No quota data returned by Cloud Code' }
  const remaining = Math.max(0, Math.min(1, Math.min(...quotas.map(quota => quota.remainingFraction ?? 0))))
  const resetAt = quotas.map(quota => quota.resetTime ? Date.parse(quota.resetTime) : 0).filter(Number.isFinite).filter(Boolean).sort((a, b) => a - b)[0]
  return { accountId, ...metadata, refreshedAt: now, source: 'provider', status: remaining <= 0.2 ? 'near-limit' : 'ok', primaryUsedPercent: (1 - remaining) * 100, resetAt: resetAt || undefined, ...(remaining === 0 ? { unavailableReason: 'Quota exhausted' } : {}) }
}
