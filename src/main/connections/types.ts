import type { ProviderAccount, ProviderConnection, ProviderUsage } from '../../shared/types'

export type { ProviderAccount, ProviderConnection, ProviderUsage }

export interface ProviderSecrets {
  apiKey?: string
  baseUrl?: string
  models?: string[]
  accessToken?: string
  refreshToken?: string
  idToken?: string
  accountId?: string
}

export interface StoredProviderAccounts {
  version: 1
  connections: ProviderConnection[]
}
