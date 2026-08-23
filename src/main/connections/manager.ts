import { randomUUID } from 'node:crypto'
import type { ProviderAccount, ProviderConnection, ProviderUsage } from '../../shared/types'
import type { ProviderConnectRequest, ProviderCapability, ProviderConnectResult } from '../../shared/providers'
import { extractOpenAISubscriptionMetadata, normalizeOpenAICodexUsage } from './usage'
import { createPkce, listenForCallback } from './oauth'
import { CODEX_REDIRECT_URI, codexAuthorizeUrl, decodeJwtProfile, exchangeCodexCode, mergeCodexAuthFile } from './codex'
import { ProviderAccountStore } from './store'
import type { Vault } from '../vault'
import { ProviderRegistry } from '../providers/registry'
import { antigravityAuthorizeUrl, exchangeAntigravityCode, fetchAntigravityProfile } from '../providers/auth/antigravity-oauth'
import type { LlmClient } from '../agent/llm'
import { buildProviderSnapshot } from './snapshot'
import type { ProviderSnapshot } from '../../shared/provider-state'
import { parseAntigravityUsage } from '../providers/antigravity-models'
import { refreshAntigravityToken } from '../providers/auth/antigravity-oauth'

interface PendingLogin {
  providerId: string
  verifier: string
  state: string
  close: () => void
}

export interface ProviderManagerDeps {
  accountsFile: string
  codexAuthFile?: string
  codexBackupFile?: string
  openExternal?: (url: string) => Promise<void> | void
  onAccountsChanged?: (connections: ProviderConnection[]) => void
  onUsage?: (usage: ProviderUsage) => void
  registry?: ProviderRegistry
  vault?: Vault
}

export class ProviderManager {
  readonly store: ProviderAccountStore
  readonly registry: ProviderRegistry
  private pending = new Map<string, PendingLogin>()
  private snapshotRevision = 1

  constructor(private readonly deps: ProviderManagerDeps) {
    this.store = new ProviderAccountStore(deps.accountsFile, deps.vault)
    this.registry = deps.registry ?? new ProviderRegistry()
  }

  list(providerId?: string): ProviderConnection[] {
    return this.store.list(providerId)
  }

  getSnapshot(): ProviderSnapshot {
    return buildProviderSnapshot(this.snapshotRevision, this.registry.listReady(), this.list())
  }

  markSnapshotChanged(): void { this.snapshotRevision++ }

  async refreshAccount(providerId: string, accountId: string): Promise<ProviderSnapshot> {
    await this.refreshModels(providerId, accountId)
    await this.refreshUsage(providerId, accountId)
    this.markSnapshotChanged()
    return this.getSnapshot()
  }

  createRuntime(providerId: string, accountId: string, modelId: string): LlmClient {
    const connection = this.store.list(providerId).find(item => item.accounts.some(account => account.id === accountId))
    const account = connection?.accounts.find(item => item.id === accountId)
    const adapter = this.registry.get(providerId)
    const secret = this.store.getSecret(accountId)
    const model = account?.models?.find(item => item === modelId)
    if (!account || !adapter || !secret || !model) throw new Error(`[bs] Provider runtime unavailable for ${providerId}/${modelId}`)
    return adapter.createClient(account, secret, { id: model, name: model, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } })
  }

  async refreshModels(providerId?: string, accountId?: string): Promise<void> {
    for (const connection of this.list(providerId)) {
      const adapter = this.registry.get(connection.providerId)
      if (!adapter) continue
      for (const account of connection.accounts) {
        if (accountId && account.id !== accountId) continue
        const secret = this.store.getSecret(account.id)
        if (!secret) continue
        try {
          const models = await adapter.listModels(account, secret)
          if (models.length > 0) this.store.upsert({ ...account, models: models.map(model => model.id) }, secret)
        } catch (error) {
          this.store.upsert({ ...account, lastError: String(error) })
        }
      }
    }
  }

  listCapabilities(): ProviderCapability[] {
    return this.registry.listReady()
  }

  async connectMethod(request: ProviderConnectRequest): Promise<ProviderConnectResult> {
    const adapter = this.registry.resolveRequest(request)
    if (request.providerId === 'openai' && request.methodId === 'oauth') {
      return this.startLogin('openai').then(login => ({ ...login, requiresBrowser: true }))
    }
    if (request.providerId === 'antigravity' && request.methodId === 'oauth') {
      return this.startLogin('antigravity').then(login => ({ ...login, requiresBrowser: true }))
    }
    const result = await adapter.connect(request, {
      saveAccount: (account, secrets) => this.store.upsert(account, secrets)
    })
    const secret = this.store.getSecret(result.account.id)
    if (secret) {
      const models = await adapter.listModels(result.account, secret)
      this.store.upsert({ ...result.account, models: models.map(model => model.id) })
    }
    this.deps.onAccountsChanged?.(this.list())
    return { accountId: result.account.id, ...(result.login ? { ...result.login, requiresBrowser: true } : {}) }
  }

  async startLogin(providerId: string): Promise<{ loginId: string; authUrl: string; expiresIn: number }> {
    if (providerId === 'antigravity') return this.startAntigravityLogin()
    if (providerId !== 'openai') throw new Error('[bs] Provider OAuth chưa được hỗ trợ')
    const pkce = createPkce()
    const callback = listenForCallback(1455)
    const loginId = randomUUID()
    this.pending.set(loginId, { providerId, verifier: pkce.verifier, state: pkce.state, close: callback.close })
    void callback.result.then(async result => {
      const pending = this.pending.get(loginId)
      this.pending.delete(loginId)
      if (!pending || result.state !== pending.state) throw new Error('[bs] OAuth state không hợp lệ')
      const tokens = await exchangeCodexCode(result.code, pending.verifier)
      const profile = decodeJwtProfile(tokens.idToken)
      const account = this.store.upsert({
        providerId,
        label: profile.email ?? `ChatGPT account ${new Date().toLocaleString()}`,
        authMode: 'oauth',
        status: 'active',
        profile: { email: profile.email, name: profile.name },
        oauthExpiresAt: tokens.expiresAt
      }, { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, idToken: tokens.idToken, accountId: profile.accountId })
      if (this.deps.codexAuthFile) {
        mergeCodexAuthFile(this.deps.codexAuthFile, { ...tokens, accountId: profile.accountId }, this.deps.codexBackupFile)
      }
      this.deps.onAccountsChanged?.(this.list())
      return account
    }).catch(() => {
      this.pending.delete(loginId)
    })
    const authUrl = codexAuthorizeUrl(pkce)
    await this.deps.openExternal?.(authUrl)
    return { loginId, authUrl, expiresIn: 300 }
  }

  private async startAntigravityLogin(): Promise<{ loginId: string; authUrl: string; expiresIn: number }> {
    const pkce = createPkce()
    const callback = listenForCallback(1457)
    const loginId = randomUUID()
    this.pending.set(loginId, { providerId: 'antigravity', verifier: pkce.verifier, state: pkce.state, close: callback.close })
    void callback.result.then(async result => {
      const pending = this.pending.get(loginId)
      this.pending.delete(loginId)
      if (!pending || result.state !== pending.state) throw new Error('[bs] Antigravity OAuth state không hợp lệ')
      const tokens = await exchangeAntigravityCode(result.code)
      const profile = await fetchAntigravityProfile(tokens.accessToken)
      const account = this.store.upsert({ providerId: 'antigravity', label: profile.email ?? `Antigravity account ${new Date().toLocaleString()}`, authMode: 'oauth', status: 'active', profile: { email: profile.email, name: profile.name }, oauthExpiresAt: tokens.expiresAt }, tokens)
      const adapter = this.registry.get('antigravity')
      if (adapter) {
        const models = await adapter.listModels(account, tokens)
        this.store.upsert({ ...account, models: models.map(model => model.id) })
      }
      this.deps.onAccountsChanged?.(this.list())
    }).catch(() => { this.pending.delete(loginId) })
    const authUrl = antigravityAuthorizeUrl(pkce.state)
    await this.deps.openExternal?.(authUrl)
    return { loginId, authUrl, expiresIn: 300 }
  }

  cancelLogin(loginId: string): void {
    const pending = this.pending.get(loginId)
    pending?.close()
    this.pending.delete(loginId)
  }

  setEnabled(accountId: string, enabled: boolean): void {
    this.store.setEnabled(accountId, enabled)
    this.deps.onAccountsChanged?.(this.list())
  }

  switch(providerId: string, accountId: string): void {
    this.store.switchActive(providerId, accountId)
    this.deps.onAccountsChanged?.(this.list())
  }

  remove(accountId: string): void {
    this.store.remove(accountId)
    this.deps.onAccountsChanged?.(this.list())
  }

  async refreshUsage(_providerId?: string, _accountId?: string): Promise<ProviderUsage[]> {
    const connections = this.list(_providerId)
    const usage: ProviderUsage[] = []
    for (const connection of connections) {
      for (const account of connection.accounts) {
        if (_accountId && account.id !== _accountId) continue
        const next = await this.fetchUsage(connection.providerId, account)
        usage.push(next)
        this.deps.onUsage?.(next)
      }
    }
    return usage
  }

  private async fetchUsage(providerId: string, account: ProviderAccount): Promise<ProviderUsage> {
    const metadata = { accountLabel: account.profile?.email ?? account.label, accountType: account.authMode === 'oauth' ? 'oauth' as const : account.authMode === 'api-key' ? 'api-key' as const : 'session' as const }
    if (providerId === 'antigravity' && account.authMode === 'oauth') return this.fetchAntigravityUsage(account, metadata)
    if (providerId !== 'openai' || account.authMode !== 'oauth' || !account.keyRef) {
      return account.usage ?? { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'Provider quota adapter unavailable' }
    }
    const secret = this.store.getSecret(account.id)
    if (!secret?.accessToken) return { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'OAuth access token unavailable' }
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${secret.accessToken}`,
        originator: 'codex_vscode',
        'user-agent': 'codex_vscode/0.146.0',
        accept: 'application/json',
        origin: 'https://chatgpt.com',
        referer: 'https://chatgpt.com/'
      }
      if (secret.accountId) headers['ChatGPT-Account-ID'] = secret.accountId
      const endpoints = ['https://chatgpt.com/backend-api/wham/usage', 'https://chatgpt.com/backend-api/codex/usage']
      let lastStatus = 0
      for (const endpoint of endpoints) {
        const response = await fetch(endpoint, { headers })
        const body = await response.text()
        if (!response.ok) {
          lastStatus = response.status
          continue
        }
        let parsed: unknown
        try { parsed = JSON.parse(body) } catch { return { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'Quota response was not valid JSON' } }
        const normalized = normalizeOpenAICodexUsage(account.id, parsed)
        normalized.accountLabel = account.profile?.email ?? account.label
        normalized.accountType = account.authMode === 'oauth' ? 'oauth' : account.authMode === 'api-key' ? 'api-key' : 'session'
        normalized.planName = normalized.planName ?? account.profile?.planName
        const subscription = await this.fetchSubscriptionMetadata(headers, secret.accountId)
        normalized.planName = normalized.planName ?? subscription.planName
        normalized.subscriptionExpiresAt = subscription.subscriptionExpiresAt ?? normalized.subscriptionExpiresAt
        account.usage = normalized
        this.store.setUsage(account.id, normalized)
        return normalized
      }
      return { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: `Quota request failed (${lastStatus || 'network error'})` }
    } catch (error) {
      return { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: String(error) }
    }
  }

  private async fetchAntigravityUsage(account: ProviderAccount, metadata: { accountLabel: string; accountType: 'oauth' | 'api-key' | 'session' }): Promise<ProviderUsage> {
    const secret = this.store.getSecret(account.id)
    if (!secret?.accessToken) return { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'OAuth access token unavailable' }
    try {
      let response = await fetch('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret.accessToken}`, 'content-type': 'application/json', 'user-agent': 'antigravity/1.15.8 windows/amd64' },
        body: JSON.stringify({})
      })
      if ((response.status === 401 || response.status === 403) && secret.refreshToken) {
        const refreshed = await refreshAntigravityToken(secret.refreshToken)
        this.store.upsert({ ...account, oauthExpiresAt: refreshed.expiresAt }, refreshed)
        response = await fetch('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels', { method: 'POST', headers: { authorization: `Bearer ${refreshed.accessToken}`, 'content-type': 'application/json', 'user-agent': 'antigravity/1.15.8 windows/amd64' }, body: '{}' })
      }
      const raw = await response.text()
      if (!response.ok) return { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: response.status === 429 ? 'near-limit' : 'unavailable', unavailableReason: `Quota request failed (${response.status})` }
      const normalized = parseAntigravityUsage(account.id, JSON.parse(raw), { ...metadata, planName: account.profile?.planName })
      account.usage = normalized
      this.store.setUsage(account.id, normalized)
      return normalized
    } catch (error) {
      return { accountId: account.id, ...metadata, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: String(error) }
    }
  }

  private async fetchSubscriptionMetadata(headers: Record<string, string>, accountId?: string): Promise<Pick<ProviderUsage, 'planName' | 'subscriptionExpiresAt'>> {
    const endpoints = [
      'https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27?timezone_offset_min=420',
      ...(accountId ? [`https://chatgpt.com/backend-api/subscriptions?account_id=${encodeURIComponent(accountId)}`] : [])
    ]
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { headers })
        if (!response.ok) continue
        const metadata = extractOpenAISubscriptionMetadata(await response.json())
        if (metadata.planName || metadata.subscriptionExpiresAt) return metadata
      } catch { /* quota remains useful when subscription metadata is unavailable */ }
    }
    return {}
  }

  close(): void {
    for (const loginId of this.pending.keys()) this.cancelLogin(loginId)
  }

  static callbackUri(): string {
    return CODEX_REDIRECT_URI
  }
}
