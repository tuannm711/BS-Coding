import type { ProviderCapability } from '../../shared/providers'
import type { ProviderConnection } from '../../shared/types'
import type { ProviderAccountSnapshot, ProviderDefinitionSnapshot, ProviderModelRef, ProviderSnapshot } from '../../shared/provider-state'

export function dedupeProviderModels(models: ProviderModelRef[]): ProviderModelRef[] {
  const byId = new Map<string, ProviderModelRef>()
  for (const model of models) {
    const current = byId.get(model.id)
    if (!current || (!current.capabilities?.isCodeModel && model.capabilities?.isCodeModel)) byId.set(model.id, model)
  }
  return [...byId.values()]
}

export function buildProviderSnapshot(revision: number, capabilities: ProviderCapability[], connections: ProviderConnection[], updatedAt = Date.now(), usageSupported = new Set<string>()): ProviderSnapshot {
  const providers: ProviderDefinitionSnapshot[] = capabilities.map(capability => ({
    id: capability.id,
    displayName: capability.displayName,
    description: capability.description ?? '',
    methods: capability.methods.map(method => ({ id: method.id, label: method.label, description: method.description, kind: method.kind, fields: method.fields, opensBrowser: method.opensBrowser, supportsMultipleAccounts: method.supportsMultipleAccounts })),
    capabilities: {
      modelDiscovery: capability.id === 'antigravity' ? 'remote' : 'static',
      runtime: capability.methods.some(method => method.kind === 'oauth') ? 'oauth' : 'api-key',
      usage: usageSupported.has(capability.id) ? 'supported' : 'unavailable'
    }
  }))
  const accounts: ProviderAccountSnapshot[] = connections.flatMap(connection => connection.accounts.map(account => ({
    id: account.id,
    providerId: connection.providerId,
    label: account.label,
    authMode: account.authMode,
    status: account.status,
    profile: account.profile,
    models: dedupeProviderModels(account.modelCatalog?.map<ProviderModelRef>(model => ({ id: model.id, name: model.name, capabilities: model.capabilities, discoveredAt: account.lastUsedAt }))
      ?? (account.models ?? []).map<ProviderModelRef>(id => ({ id, name: id, discoveredAt: account.lastUsedAt, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }))),
    usage: account.usage,
    refreshStages: account.refreshStages,
    ...(account.poolErrors ? { poolErrors: account.poolErrors } : {}),
    ...(account.providerError ? { error: account.providerError } : account.lastError ? { error: { kind: 'unknown' as const, message: account.lastError, updatedAt: account.lastUsedAt } } : {}),
    updatedAt: account.lastUsedAt
  })))
  return { revision, providers, accounts, assignments: [], updatedAt }
}
