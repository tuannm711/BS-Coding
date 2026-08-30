import type { ProviderAccountSummary } from '../../../../shared/v2/contracts/provider'

interface LegacyAccount {
  id: string
  providerId: string
  enabled?: boolean
  status?: string
  keyRef?: string
}

interface LegacyProviderAccountEdge {
  listConnections(): readonly { providerId: string; accounts: readonly LegacyAccount[] }[]
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
