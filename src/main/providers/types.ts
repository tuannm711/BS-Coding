import type { ProviderAccount, ProviderUsage } from '../../shared/types'
import type { AuthMethodDescriptor, ProviderCapability, ProviderConnectRequest, ProviderModel } from '../../shared/providers'
import type { LlmClient } from '../agent/llm'
import type { ProviderSecrets } from '../connections/types'

export interface ProviderAdapterContext {
  saveAccount(account: Omit<ProviderAccount, 'id' | 'createdAt' | 'lastUsedAt'>, secrets?: ProviderSecrets): ProviderAccount
}

export interface ProviderAdapter {
  capability: ProviderCapability
  connect(request: ProviderConnectRequest, context: ProviderAdapterContext): Promise<{ account: ProviderAccount; login?: { loginId: string; authUrl: string; expiresIn: number } }>
  listModels(account: ProviderAccount, secret: ProviderSecrets): Promise<ProviderModel[]>
  createClient(account: ProviderAccount, secret: ProviderSecrets, model: ProviderModel): LlmClient
  fetchUsage?(account: ProviderAccount, secret: ProviderSecrets): Promise<ProviderUsage>
}

export type ProviderAuthMethod = AuthMethodDescriptor
