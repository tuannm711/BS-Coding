import type { ProviderQuotaGroup, ProviderUsage } from './types'

export interface QuotaAccount {
  id: string
  providerId: string
  models?: ReadonlyArray<string | { id: string }>
  usage?: ProviderUsage
}

export interface QuotaBinding {
  name?: string
  provider?: string
  accountId?: string
  quotaPoolId?: string
  model?: string
}

export interface AgentQuotaPool {
  id: string
  label: string
  modelIds: string[]
  groups: ProviderQuotaGroup[]
}

export function quotaFamilyFor(modelId: string): 'gemini' | 'claude-gpt' | undefined {
  const normalized = modelId.toLowerCase()
  if (normalized.includes('gemini')) return 'gemini'
  if (normalized.includes('claude') || normalized.includes('gpt') || normalized.startsWith('3p-')) return 'claude-gpt'
  return undefined
}

export function groupClaimsModel(group: ProviderQuotaGroup, modelId: string): boolean {
  return group.modelIds.includes(modelId) || (group.modelIds.length === 0 && quotaFamilyFor(modelId) === group.id)
}

// Time windows constrain the same quota; they do not create extra agent slots.
// Antigravity declares two independent model families, even before usage loads.
export function quotaPoolsForAccount(account: QuotaAccount): AgentQuotaPool[] {
  const models = [...new Set((account.models ?? []).map(model => typeof model === 'string' ? model : model.id))]
  const groups = account.usage?.quotaGroups ?? []
  if (account.providerId === 'antigravity') {
    return (['gemini', 'claude-gpt'] as const).map(id => ({
      id,
      label: id === 'gemini' ? 'Gemini' : 'Claude / GPT',
      modelIds: models.filter(model => quotaFamilyFor(model) === id),
      groups: groups.filter(group => group.id === id || group.modelIds.some(model => quotaFamilyFor(model) === id))
    }))
  }
  return [{ id: 'account', label: 'Shared quota', modelIds: models, groups }]
}

export function quotaPoolForModel(account: QuotaAccount, modelId: string): string | undefined {
  if (!modelId) return undefined
  if (account.providerId === 'antigravity') return quotaFamilyFor(modelId)
  return 'account'
}

export function boundQuotaPool(binding: QuotaBinding, account: QuotaAccount): string | undefined {
  return binding.quotaPoolId ?? (binding.model ? quotaPoolForModel(account, binding.model) : undefined)
}

export function modelsForAgentQuota(binding: QuotaBinding, accounts: readonly QuotaAccount[]): string[] {
  const account = accounts.find(item => item.id === binding.accountId && item.providerId === binding.provider)
  if (!account) return []
  const poolId = boundQuotaPool(binding, account)
  return quotaPoolsForAccount(account).find(pool => pool.id === poolId)?.modelIds ?? []
}

export function agentQuotaConflicts(bindings: readonly QuotaBinding[], accounts: readonly QuotaAccount[]): Array<{ key: string; agentNames: string[] }> {
  const occupied = new Map<string, string[]>()
  for (const binding of bindings) {
    if (!binding.provider || !binding.accountId || !binding.name) continue
    const account = accounts.find(item => item.id === binding.accountId && item.providerId === binding.provider)
      ?? { id: binding.accountId, providerId: binding.provider }
    const pool = boundQuotaPool(binding, account)
    if (!pool) continue
    const key = `${binding.provider}/${binding.accountId}/${pool}`
    const names = occupied.get(key) ?? []
    if (!names.includes(binding.name)) names.push(binding.name)
    occupied.set(key, names)
  }
  return [...occupied].flatMap(([key, agentNames]) => agentNames.length > 1 ? [{ key, agentNames }] : [])
}
