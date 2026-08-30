import type {
  ProviderAccountSummary, RuntimeTargetCandidateSummary
} from '../../../../shared/v2/contracts/provider'
import type { QuotaSnapshot } from '../../../../shared/v2/contracts/usage'

interface LegacyModel {
  id: string
  name?: string
  capabilities?: { supportsTools?: boolean }
}

interface LegacyAccount {
  id: string
  providerId: string
  enabled?: boolean
  status?: string
  keyRef?: string
  label?: string
  models?: readonly string[]
  modelCatalog?: readonly LegacyModel[]
  usage?: { status?: string; primaryUsedPercent?: number; resetAt?: number;
    refreshedAt?: number }
}

interface LegacyProviderAccountEdge {
  listConnections(): readonly { providerId: string; providerName?: string;
    accounts: readonly LegacyAccount[] }[]
  connectMethod(input: { providerId: string; methodId: string;
    fields: Readonly<Record<string, string>> }): Promise<unknown>
  refreshAccount(providerId: string, accountId: string): Promise<unknown>
  setEnabled(accountId: string, enabled: boolean): void
}

function status(value: string | undefined): ProviderAccountSummary['status'] {
  if (value === 'active' || value === 'connected') return 'HEALTHY'
  if (value === 'expired') return 'EXPIRED'
  if (value === 'error') return 'ERROR'
  return 'UNKNOWN'
}

// Delete at P18 after V2 provider/account storage and connection methods replace V1.
export class V1ProviderAccountAdapter {
  constructor(private readonly legacy: LegacyProviderAccountEdge) {}

  async listAccounts(): Promise<ProviderAccountSummary[]> {
    return this.legacy.listConnections().flatMap(connection => connection.accounts.map(account => ({
      id: account.id, providerId: account.providerId || connection.providerId,
      enabled: account.enabled ?? account.status !== 'disabled', status: status(account.status)
    })))
  }

  async listRuntimeTargets(): Promise<RuntimeTargetCandidateSummary[]> {
    return this.legacy.listConnections().flatMap(connection => connection.accounts.flatMap(account => {
      const accountStatus = status(account.status)
      const enabled = account.enabled ?? account.status !== 'disabled'
      const selectable = enabled && accountStatus === 'HEALTHY'
      const unavailableReason = !enabled ? 'Account disabled'
        : accountStatus !== 'HEALTHY' ? `Account status: ${accountStatus}` : undefined
      const catalog = account.modelCatalog?.length ? account.modelCatalog
        : (account.models ?? []).map((id): LegacyModel => ({ id, name: id }))
      return catalog.map(model => ({
        id: `${connection.providerId}/${account.id}/${model.id}`,
        providerName: connection.providerName ?? connection.providerId,
        accountLabel: account.label ?? account.id,
        modelName: model.name ?? model.id,
        accountStatus, selectable, ...(unavailableReason ? { unavailableReason } : {}),
        target: { providerId: connection.providerId, accountId: account.id, modelId: model.id,
          capabilities: { structuredTools: model.capabilities?.supportsTools === false
            ? 'UNSUPPORTED' as const : 'UNKNOWN' as const } }
      }))
    })).sort((left, right) => left.providerName.localeCompare(right.providerName) ||
      left.accountLabel.localeCompare(right.accountLabel) || left.modelName.localeCompare(right.modelName) ||
      left.id.localeCompare(right.id))
  }

  async listQuotaSnapshots(): Promise<QuotaSnapshot[]> {
    return this.legacy.listConnections().flatMap(connection => connection.accounts.map(account => {
      const usage = account.usage
      const capturedAt = new Date(typeof usage?.refreshedAt === 'number'
        ? usage.refreshedAt : Date.now()).toISOString()
      return { providerId: connection.providerId, accountId: account.id,
        status: usage?.status === 'ok' ? 'AVAILABLE' as const : 'UNAVAILABLE' as const,
        ...(typeof usage?.primaryUsedPercent === 'number'
          ? { remainingPercent: Math.max(0, Math.min(100, 100 - usage.primaryUsedPercent)) } : {}),
        ...(typeof usage?.resetAt === 'number' ? { resetAt: new Date(usage.resetAt).toISOString() } : {}),
        capturedAt }
    }))
  }

  async connect(input: { providerId: string; apiKey: string }): Promise<void> {
    await this.legacy.connectMethod({ providerId: input.providerId, methodId: 'api-key',
      fields: { apiKey: input.apiKey } })
  }

  async refresh(input: { providerId: string }): Promise<void> {
    const account = this.legacy.listConnections().find(item => item.providerId === input.providerId)
      ?.accounts[0]
    if (!account) throw new Error('provider account is unavailable')
    await this.legacy.refreshAccount(input.providerId, account.id)
  }

  async setEnabled(input: { accountId: string; enabled: boolean }): Promise<void> {
    this.legacy.setEnabled(input.accountId, input.enabled)
  }

  async probe(input: { providerId: string }): Promise<void> {
    await this.refresh(input)
  }
}
