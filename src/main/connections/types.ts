import type { ProviderAccount, ProviderConnection, ProviderUsage } from '../../shared/types'

export type { ProviderAccount, ProviderConnection, ProviderUsage }

export interface ProviderSecrets {
  apiKey?: string
  baseUrl?: string
  models?: string[]
  accessToken?: string
  githubAccessToken?: string
  refreshToken?: string
  idToken?: string
  accountId?: string
  organizationId?: string
  expiresAt?: number
  projectId?: string
  planName?: string
  cloudCodeBaseUrl?: string
}

export interface StoredProviderAccounts {
  version: 1
  connections: ProviderConnection[]
}
