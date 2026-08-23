import type { ProviderCapability } from '../../shared/providers'
import type { ProviderConnection } from '../../shared/types'
import type { ProviderAccountSnapshot, ProviderDefinitionSnapshot, ProviderModelRef, ProviderSnapshot } from '../../shared/provider-state'

export function buildProviderSnapshot(revision: number, capabilities: ProviderCapability[], connections: ProviderConnection[], updatedAt = Date.now()): ProviderSnapshot {
  const providers: ProviderDefinitionSnapshot[] = capabilities.map(capability => ({
    id: capability.id,
    displayName: capability.displayName,
    description: capability.description ?? '',
    methods: capability.methods.map(method => ({ id: method.id, label: method.label, kind: method.kind, fields: method.fields, supportsMultipleAccounts: method.supportsMultipleAccounts })),
    capabilities: {
      modelDiscovery: capability.id === 'antigravity' ? 'account' : 'static',
      runtime: capability.methods.some(method => method.kind === 'oauth') ? 'oauth' : 'api-key',
      usage: capability.id === 'antigravity' ? 'unavailable' : 'supported'
    }
  }))
  const accounts: ProviderAccountSnapshot[] = connections.flatMap(connection => connection.accounts.map(account => ({
    id: account.id,
    providerId: connection.providerId,
    label: account.label,
    authMode: account.authMode,
    status: account.status,
    profile: account.profile,
    models: (account.models ?? []).map<ProviderModelRef>(id => ({ id, name: id, discoveredAt: account.lastUsedAt, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } })),
    usage: account.usage,
    ...(account.lastError ? { error: { kind: 'unknown' as const, message: account.lastError, updatedAt: account.lastUsedAt } } : {}),
    updatedAt: account.lastUsedAt
  })))
  return { revision, providers, connections, accounts, assignments: [], updatedAt }
}
