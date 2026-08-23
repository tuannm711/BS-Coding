import type { ProviderAccount, ProviderConnection, ProviderUsage } from '../../shared/types'
import type {
  ProviderAuthorizationError,
  ProviderAuthorizationRequest,
  ProviderAuthorizationSession,
  ProviderConnectRequest,
  ProviderCapability,
  ProviderConnectResult
} from '../../shared/providers'
import { createPkce, listenForCallback, OAuthCallbackError } from './oauth'
import { ProviderAccountStore } from './store'
import type { Vault } from '../vault'
import { ProviderRegistry } from '../providers/registry'
import type { ProviderAuthorizationStrategy } from '../providers/types'
import type { LlmClient } from '../agent/llm'
import { buildProviderSnapshot } from './snapshot'
import { classifyProviderError, type ProviderSnapshot } from '../../shared/provider-state'
import { AuthSessionCoordinator } from '../providers/auth/session'
import { calcCost, type ModelPrice } from '../agent/usage'
import { ProviderUsageLedger, type UsagePeriod } from './usage-ledger'

function runtimeProviderError(message: string) {
  const statusCode = Number(message.match(/\((\d{3})\)/)?.[1]) || undefined
  const retryAfter = Number(message.match(/retry-after[=:]\s*(\d+)/i)?.[1]) || 0
  const error = classifyProviderError(statusCode, message)
  if (retryAfter > 0) error.retryAt = Date.now() + retryAfter * 1000
  return error
}

export interface ProviderManagerDeps {
  accountsFile: string
  openExternal?: (url: string) => Promise<void> | void
  onAccountsChanged?: (connections: ProviderConnection[]) => void
  onUsage?: (usage: ProviderUsage) => void
  onAuthorizationChanged?: (session: ProviderAuthorizationSession) => void
  registry?: ProviderRegistry
  vault?: Vault
  usageLedger?: ProviderUsageLedger
  priceFor?: (providerId: string, modelId: string) => ModelPrice | undefined
}

export class ProviderManager {
  readonly store: ProviderAccountStore
  readonly registry: ProviderRegistry
  private readonly authorizations = new AuthSessionCoordinator()
  private snapshotRevision = 1

  constructor(private readonly deps: ProviderManagerDeps) {
    this.store = new ProviderAccountStore(deps.accountsFile, deps.vault)
    this.registry = deps.registry ?? new ProviderRegistry()
  }

  list(providerId?: string): ProviderConnection[] {
    return this.store.list(providerId)
  }

  getSnapshot(): ProviderSnapshot {
    const capabilities = this.registry.listReady()
    const usageSupported = new Set(capabilities.filter(capability => Boolean(this.registry.get(capability.id)?.fetchUsage)).map(capability => capability.id))
    return buildProviderSnapshot(this.snapshotRevision, capabilities, this.list(), Date.now(), usageSupported)
  }

  markSnapshotChanged(): void { this.snapshotRevision++ }

  private emitAccountsChanged(): void {
    this.markSnapshotChanged()
    this.deps.onAccountsChanged?.(this.list())
  }

  private emitUsage(usage: ProviderUsage): void {
    this.markSnapshotChanged()
    this.deps.onUsage?.(usage)
  }

  async refreshAccount(providerId: string, accountId: string): Promise<ProviderSnapshot> {
    const account = this.store.get(accountId)
    const secret = this.store.getSecret(accountId)
    const adapter = this.registry.get(providerId)
    if (!account || account.providerId !== providerId || !secret || !adapter) throw new Error('[bs] Provider account không khả dụng')
    const refreshedSecret = adapter.refreshCredentials ? await adapter.refreshCredentials(account, secret) : secret
    const refreshedAccount = await adapter.refreshAccount(account, refreshedSecret)
    const current = this.store.get(accountId)
    if (!current) throw new Error('[bs] Provider account was removed during refresh')
    this.store.upsert({ ...refreshedAccount, status: current.status, keyRef: current.keyRef, oauthExpiresAt: refreshedSecret.expiresAt ?? refreshedAccount.oauthExpiresAt, refreshStages: { credentials: 'ready', models: 'refreshing', usage: 'refreshing' } }, refreshedSecret)
    this.emitAccountsChanged()
    await this.refreshModels(providerId, accountId)
    await this.refreshUsage(providerId, accountId)
    return this.getSnapshot()
  }

  createRuntime(providerId: string, accountId: string, modelId: string): LlmClient {
    const connection = this.store.list(providerId).find(item => item.accounts.some(account => account.id === accountId))
    const account = connection?.accounts.find(item => item.id === accountId)
    const adapter = this.registry.get(providerId)
    const secret = this.store.getSecret(accountId)
    const model = account?.modelCatalog?.find(item => item.id === modelId)
      ?? (account?.models?.includes(modelId) ? { id: modelId, name: modelId, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } } : undefined)
    if (!account || !adapter || !secret || !model) throw new Error(`[bs] Provider runtime unavailable for ${providerId}/${modelId}`)
    const manager = this
    return {
      async *stream(request) {
        let forceRefresh = false
        for (let attempt = 0; attempt < 2; attempt++) {
          const currentAccount = manager.store.get(accountId)
          const currentSecret = manager.store.getSecret(accountId)
          if (!currentAccount || !currentSecret) throw new Error(`[bs] Provider runtime unavailable for ${providerId}/${modelId}`)
          const readySecret = adapter.refreshCredentials
            ? await adapter.refreshCredentials(currentAccount, currentSecret, { force: forceRefresh })
            : currentSecret
          if (readySecret !== currentSecret) manager.store.upsert({ ...currentAccount, oauthExpiresAt: readySecret.expiresAt ?? currentAccount.oauthExpiresAt }, readySecret)
          let retryAuth = false
          let hadError = false
          let completed = false
          let completedTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
          try {
            for await (const part of adapter.createRuntime(currentAccount, readySecret, model).stream(request)) {
              if (part.kind === 'error') {
                hadError = true
                const error = runtimeProviderError(part.error ?? 'Provider runtime error')
                if (error.kind === 'auth' && attempt === 0 && adapter.refreshCredentials && readySecret.refreshToken) {
                  retryAuth = true
                  break
                }
                manager.recordRuntimeError(accountId, error)
              }
              if (part.kind === 'finish') {
                completed = true
                completedTokens = {
                  input: part.tokens?.input ?? 0,
                  output: part.tokens?.output ?? 0,
                  cacheRead: part.tokens?.cacheRead ?? 0,
                  cacheWrite: part.tokens?.cacheWrite ?? 0
                }
              }
              yield part
            }
          } catch (error) {
            manager.recordRuntimeError(accountId, runtimeProviderError(String(error)))
            throw error
          }
          if (!retryAuth) {
            if (!hadError) {
              manager.clearRuntimeError(accountId)
              if (completed) manager.recordRuntimeUsage(providerId, accountId, modelId, completedTokens)
            }
            return
          }
          forceRefresh = true
        }
      }
    }
  }

  private recordRuntimeUsage(providerId: string, accountId: string, modelId: string, tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }): void {
    const ledger = this.deps.usageLedger
    const account = this.store.get(accountId)
    if (!ledger || !account) return
    const now = Date.now()
    const period = runtimeUsagePeriod(account.usage, account.createdAt || now)
    const groupId = account.usage?.quotaGroups?.find(group => group.modelIds.includes(modelId))?.id
      ?? (account.usage?.quotaGroups?.length === 1 ? account.usage.quotaGroups[0].id : undefined)
    const tracked = ledger.record({
      providerId,
      accountId,
      modelId,
      quotaGroupId: groupId,
      timestamp: now,
      tokens,
      estimatedCost: calcCost(tokens, this.deps.priceFor?.(providerId, modelId))
    }, period)
    const usage: ProviderUsage = account.usage
      ? { ...account.usage, accountId, tracked }
      : { accountId, tracked, refreshedAt: now, source: 'internal', status: 'unavailable', unavailableReason: 'Provider quota has not been refreshed' }
    this.store.upsert({ ...account, usage })
    this.emitUsage(usage)
  }

  private recordRuntimeError(accountId: string, error: ReturnType<typeof classifyProviderError>): void {
    const current = this.store.get(accountId)
    if (!current) return
    this.store.upsert({ ...current, lastError: error.message, providerError: error })
    this.emitAccountsChanged()
  }

  private clearRuntimeError(accountId: string): void {
    const current = this.store.get(accountId)
    if (!current?.providerError && !current?.lastError) return
    const { providerError: _providerError, lastError: _lastError, ...cleared } = current
    this.store.upsert(cleared)
    this.emitAccountsChanged()
  }

  async refreshModels(providerId?: string, accountId?: string): Promise<void> {
    let mutated = false
    for (const connection of this.list(providerId)) {
      const adapter = this.registry.get(connection.providerId)
      if (!adapter) continue
      for (const account of connection.accounts) {
        if (accountId && account.id !== accountId) continue
        const secret = this.store.getSecret(account.id)
        if (!secret) continue
        try {
          const readySecret = adapter.refreshCredentials ? await adapter.refreshCredentials(account, secret) : secret
          const accountAfterCredentials = this.store.get(account.id)
          if (!accountAfterCredentials) continue
          const models = await adapter.listModels(accountAfterCredentials, readySecret)
          const current = this.store.get(account.id)
          if (!current) continue
          if (models.length > 0) {
            const { lastError: _lastError, ...recovered } = current
            this.store.upsert({ ...recovered, oauthExpiresAt: readySecret.expiresAt ?? current.oauthExpiresAt, models: models.map(model => model.id), modelCatalog: models, refreshStages: current.refreshStages ? { ...current.refreshStages, models: 'ready' } : undefined }, readySecret)
            mutated = true
          }
        } catch (error) {
          const current = this.store.get(account.id)
          if (!current) continue
          this.store.upsert({ ...current, lastError: String(error), refreshStages: current.refreshStages ? { ...current.refreshStages, models: 'error' } : undefined })
          mutated = true
        }
      }
    }
    if (mutated) this.emitAccountsChanged()
  }

  listCapabilities(): ProviderCapability[] {
    return this.registry.listReady()
  }

  async createAuthorization(request: ProviderAuthorizationRequest): Promise<ProviderAuthorizationSession> {
    const adapter = this.registry.resolveRequest({ ...request, fields: {} })
    const method = adapter.capability.methods.find(candidate => candidate.id === request.methodId)
    const strategy = adapter.authorization
    if (method?.kind !== 'oauth' || !strategy || strategy.methodId !== request.methodId) {
      throw new Error('[bs] Provider OAuth authorization link is unavailable')
    }
    const reconnectAccount = request.reconnectAccountId ? this.store.get(request.reconnectAccountId) ?? undefined : undefined
    if (request.reconnectAccountId && (!reconnectAccount || reconnectAccount.providerId !== request.providerId)) {
      throw new Error('[bs] Account reconnect không hợp lệ')
    }
    const reconnectSecret = reconnectAccount ? this.store.getSecret(reconnectAccount.id) ?? undefined : undefined
    const previousActiveAccountId = this.store.list(request.providerId)[0]?.activeAccountId ?? null

    const pkce = createPkce()
    const callback = await listenForCallback(strategy.callback)
    let built: ReturnType<ProviderAuthorizationStrategy['build']>
    try {
      built = strategy.build({ pkce, callbackUrl: callback.callbackUrl })
    } catch (error) {
      callback.close()
      throw error
    }
    const session = this.authorizations.start({
      providerId: request.providerId,
      methodId: request.methodId,
      reconnectAccountId: request.reconnectAccountId,
      authUrl: built.authUrl,
      expiresAt: Date.now() + strategy.callback.timeoutMs,
      verifier: pkce.verifier,
      expectedState: built.expectedState,
      callbackUrl: callback.callbackUrl,
      close: callback.close
    })
    this.emitAuthorization(session)

    void callback.result.then(async result => {
      const pending = this.authorizations.pending(session.loginId)
      if (!pending) return
      if (result.state !== pending.expectedState) {
        throw new OAuthCallbackError('oauth-state-mismatch', '[bs] OAuth callback state does not match the pending session')
      }
      const completed = await strategy.complete({
        code: result.code,
        verifier: pending.verifier,
        callbackUrl: pending.callbackUrl,
        reconnectAccount
      })
      let saved: ProviderAccount | undefined
      let hydrated: ProviderAccount
      try {
        saved = this.store.upsert({
          ...completed.account,
          ...(reconnectAccount
            ? { id: reconnectAccount.id, createdAt: reconnectAccount.createdAt, keyRef: reconnectAccount.keyRef }
            : {})
        }, completed.secrets)
        const models = await adapter.listModels(saved, completed.secrets)
        hydrated = this.store.upsert({
          ...saved,
          models: models.map(model => model.id),
          modelCatalog: models
        }, completed.secrets)
        await strategy.afterPersist?.(hydrated, completed.secrets)
      } catch (error) {
        if (saved) {
          if (reconnectAccount) this.store.upsert(reconnectAccount, reconnectSecret)
          else this.store.remove(saved.id)
          if (previousActiveAccountId && this.store.get(previousActiveAccountId)?.status === 'active') {
            this.store.switchActive(request.providerId, previousActiveAccountId)
          }
        }
        throw error
      }
      this.emitAccountsChanged()
      const next = this.authorizations.complete(session.loginId, hydrated.id)
      if (next) this.emitAuthorization(next)
    }).catch(error => {
      const classified = authorizationError(error)
      const next = classified.kind === 'authorization-expired'
        ? this.authorizations.expire(session.loginId)
        : this.authorizations.fail(session.loginId, classified)
      if (next) this.emitAuthorization(next)
    })
    return session
  }

  getAuthorization(loginId: string): ProviderAuthorizationSession | undefined {
    return this.authorizations.public(loginId)
  }

  async openAuthorization(loginId: string): Promise<void> {
    const pending = this.authorizations.pending(loginId)
    if (!pending) throw new Error('[bs] OAuth authorization session is not waiting')
    try {
      if (!this.deps.openExternal) throw new Error('External browser integration unavailable')
      await this.deps.openExternal(pending.authUrl)
    } catch (error) {
      const next = this.authorizations.fail(loginId, {
        kind: 'browser-open-failed',
        message: '[bs] Unable to open the OAuth authorization link'
      })
      if (next) this.emitAuthorization(next)
      throw error
    }
  }

  cancelAuthorization(loginId: string): ProviderAuthorizationSession | undefined {
    const next = this.authorizations.cancel(loginId)
    if (next) this.emitAuthorization(next)
    return next
  }

  private emitAuthorization(session: ProviderAuthorizationSession): void {
    this.deps.onAuthorizationChanged?.(session)
  }

  async connectMethod(request: ProviderConnectRequest): Promise<ProviderConnectResult> {
    const adapter = this.registry.resolveRequest(request)
    const reconnectAccount = request.reconnectAccountId ? this.store.get(request.reconnectAccountId) : null
    if (request.reconnectAccountId && (!reconnectAccount || reconnectAccount.providerId !== request.providerId)) throw new Error('[bs] Account reconnect không hợp lệ')
    const method = adapter.capability.methods.find(candidate => candidate.id === request.methodId)
    if (method?.kind === 'oauth' && adapter.authorization) {
      const session = await this.createAuthorization({
        providerId: request.providerId,
        methodId: request.methodId,
        reconnectAccountId: request.reconnectAccountId
      })
      return {
        loginId: session.loginId,
        authUrl: session.authUrl,
        expiresIn: Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000)),
        requiresBrowser: true
      }
    }
    const result = await adapter.connect(request, {
      saveAccount: (account, secrets) => this.store.upsert({ ...account, ...(reconnectAccount ? { id: reconnectAccount.id, createdAt: reconnectAccount.createdAt, keyRef: reconnectAccount.keyRef } : {}) }, secrets)
    })
    const secret = this.store.getSecret(result.account.id)
    if (secret) {
      const models = await adapter.listModels(result.account, secret)
      this.store.upsert({ ...result.account, models: models.map(model => model.id), modelCatalog: models }, secret)
    }
    this.emitAccountsChanged()
    return { accountId: result.account.id, ...(result.login ? { ...result.login, requiresBrowser: true } : {}) }
  }

  setEnabled(accountId: string, enabled: boolean): void {
    this.store.setEnabled(accountId, enabled)
    this.emitAccountsChanged()
  }

  switch(providerId: string, accountId: string): void {
    this.store.switchActive(providerId, accountId)
    this.emitAccountsChanged()
  }

  remove(accountId: string): void {
    this.store.remove(accountId)
    this.emitAccountsChanged()
  }

  async refreshUsage(_providerId?: string, _accountId?: string): Promise<ProviderUsage[]> {
    const connections = this.list(_providerId)
    const usage: ProviderUsage[] = []
    for (const connection of connections) {
      for (const account of connection.accounts) {
        if (_accountId && account.id !== _accountId) continue
        const next = await this.fetchUsage(connection.providerId, account)
        const current = this.store.get(account.id)
        if (!current) continue
        this.store.upsert({ ...current, usage: next, refreshStages: current.refreshStages ? { ...current.refreshStages, usage: next.status === 'unavailable' ? 'unavailable' : 'ready' } : undefined })
        usage.push(next)
        this.emitUsage(next)
      }
    }
    return usage
  }

  private async fetchUsage(providerId: string, account: ProviderAccount): Promise<ProviderUsage> {
    const metadata = { accountLabel: account.profile?.email ?? account.label, accountType: account.authMode === 'oauth' ? 'oauth' as const : account.authMode === 'api-key' ? 'api-key' as const : 'session' as const }
    const adapter = this.registry.get(providerId)
    const secret = this.store.getSecret(account.id)
    if (!adapter?.fetchUsage || !secret) return account.usage ?? { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'Provider quota adapter unavailable' }
    if (account.usage?.resetAt && account.usage.resetAt > Date.now() && /quota exhausted|capacity exhausted/i.test(account.usage.unavailableReason ?? '')) return account.usage
    try {
      const readySecret = adapter.refreshCredentials ? await adapter.refreshCredentials(account, secret) : secret
      const usage = await adapter.fetchUsage(account, readySecret)
      const current = this.store.get(account.id)
      if (current) this.store.upsert(current, readySecret)
      return usage
    } catch (error) {
      return { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: String(error) }
    }
  }

  close(): void {
    this.authorizations.closeAll()
  }

}

function runtimeUsagePeriod(usage: ProviderUsage | undefined, firstObservedAt: number): UsagePeriod {
  const windows = usage?.quotaGroups?.flatMap(group => group.windows) ?? []
  const preferred = windows.find(window => window.kind === 'weekly' && window.resetAt !== undefined)
    ?? windows.find(window => window.kind === 'monthly' && window.resetAt !== undefined)
    ?? [...windows].filter(window => window.resetAt !== undefined).sort((a, b) => (b.windowMinutes ?? 0) - (a.windowMinutes ?? 0))[0]
  if (!preferred?.resetAt) return { key: `local:${firstObservedAt}`, start: firstObservedAt }
  const start = preferred.windowMinutes === undefined
    ? firstObservedAt
    : preferred.resetAt - preferred.windowMinutes * 60_000
  return { key: `${preferred.kind}:${preferred.resetAt}`, start, end: preferred.resetAt }
}

function authorizationError(error: unknown): ProviderAuthorizationError {
  if (error instanceof OAuthCallbackError) return { kind: error.kind, message: error.message }
  const message = String(error)
  if (/entitlement|copilot token/i.test(message)) return { kind: 'entitlement-missing', message: '[bs] Provider entitlement is unavailable' }
  if (/profile|userinfo/i.test(message)) return { kind: 'profile-fetch-failed', message: '[bs] Provider profile could not be loaded' }
  if (/state/i.test(message)) return { kind: 'oauth-state-mismatch', message: '[bs] OAuth callback state is invalid' }
  return { kind: 'token-exchange-failed', message: '[bs] OAuth token exchange failed' }
}
