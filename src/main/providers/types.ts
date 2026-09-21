import type { ProviderAccount, ProviderUsage } from '../../shared/types'
import type { AuthMethodDescriptor, ProviderCapability, ProviderConnectRequest, ProviderModel } from '../../shared/providers'
import type { LlmClient } from '../agent/llm'
import type { ProviderSecrets } from '../connections/types'

export interface ProviderAdapterContext {
  saveAccount(account: Omit<ProviderAccount, 'id' | 'createdAt' | 'lastUsedAt'> & Partial<Pick<ProviderAccount, 'id' | 'createdAt' | 'lastUsedAt'>>, secrets?: ProviderSecrets): ProviderAccount
}

export interface ProviderAuthorizationBuildInput {
  pkce: { verifier: string; challenge: string; state: string }
  callbackUrl: string
}

export interface ProviderAuthorizationBuildResult {
  authUrl: string
  expectedState: string
}

export interface ProviderAuthorizationCompleteInput {
  code: string
  verifier: string
  callbackUrl: string
  reconnectAccount?: ProviderAccount
}

export interface ProviderAuthorizationCompleteResult {
  account: Omit<ProviderAccount, 'id' | 'createdAt' | 'lastUsedAt'>
  secrets: ProviderSecrets
}

export interface ProviderCallbackAuthorizationStrategy {
  kind?: 'callback'
  methodId: string
  callback: { port: number; path: string; timeoutMs: number }
  build(input: ProviderAuthorizationBuildInput): ProviderAuthorizationBuildResult
  complete(input: ProviderAuthorizationCompleteInput): Promise<ProviderAuthorizationCompleteResult>
  afterPersist?(account: ProviderAccount, secrets: ProviderSecrets): Promise<void> | void
}

export interface ProviderManagedAuthorizationContext {
  saveAccount(account: Omit<ProviderAccount, 'id' | 'createdAt' | 'lastUsedAt'> & Partial<Pick<ProviderAccount, 'id' | 'createdAt' | 'lastUsedAt'>>, secrets?: ProviderSecrets): ProviderAccount
  onConnected(result: { loginId: string; account: ProviderAccount }): void
  onError(result: { loginId: string; error: import('../../shared/providers').ProviderAuthorizationError }): void
}

export interface ProviderManagedAuthorizationStartResult {
  loginId: string
  authUrl: string
  verificationUrl?: string
  userCode?: string
  expiresAt: number
  close: () => void
}

export interface ProviderManagedAuthorizationStrategy {
  kind: 'managed'
  methodId: string | string[]
  start(request: import('../../shared/providers').ProviderAuthorizationRequest, context: ProviderManagedAuthorizationContext): Promise<ProviderManagedAuthorizationStartResult>
  cancel?(loginId: string): Promise<void> | void
}

export type ProviderAuthorizationStrategy = ProviderCallbackAuthorizationStrategy | ProviderManagedAuthorizationStrategy

export interface ProviderAdapter {
  capability: ProviderCapability
  authorization?: ProviderAuthorizationStrategy | ProviderAuthorizationStrategy[]
  definition(): ProviderCapability
  connect(request: ProviderConnectRequest, context: ProviderAdapterContext): Promise<{ account: ProviderAccount; login?: { loginId: string; authUrl: string; expiresIn: number } }>
  refreshAccount(account: ProviderAccount, secret: ProviderSecrets): Promise<ProviderAccount>
  refreshCredentials?(account: ProviderAccount, secret: ProviderSecrets, options?: { force?: boolean }): Promise<ProviderSecrets>
  listModels(account: ProviderAccount, secret: ProviderSecrets): Promise<ProviderModel[]>
  createRuntime(account: ProviderAccount, secret: ProviderSecrets, model: ProviderModel): LlmClient
  recoverRuntimeContext?(account: ProviderAccount, secret: ProviderSecrets, failure: { code: 'runtime-entity-not-found'; modelId: string }): Promise<{ secret: ProviderSecrets; models: ProviderModel[] }>
  fetchUsage?(account: ProviderAccount, secret: ProviderSecrets): Promise<ProviderUsage>
  /** Which quota pool a model draws on, or undefined when it cannot be placed. */
  quotaGroupForModel?(modelId: string): string | undefined
  /** Spend one provider-side quota reset. Irreversible. */
  consumeResetCredit?(account: ProviderAccount, secret: ProviderSecrets): Promise<void>
  /** Provider-specific cleanup when an account is removed by the user. */
  removeAccount?(account: ProviderAccount, secret?: ProviderSecrets): Promise<void> | void
}

export type ProviderAuthMethod = AuthMethodDescriptor
