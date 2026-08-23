import { randomUUID } from 'node:crypto'
import type { ProviderAccount, ProviderConnection, ProviderUsage } from '../../shared/types'
import { normalizeOpenAICodexUsage } from './usage'
import { createPkce, listenForCallback } from './oauth'
import { CODEX_REDIRECT_URI, codexAuthorizeUrl, decodeJwtProfile, exchangeCodexCode, mergeCodexAuthFile } from './codex'
import { ProviderAccountStore } from './store'

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
}

export class ProviderManager {
  readonly store: ProviderAccountStore
  private pending = new Map<string, PendingLogin>()

  constructor(private readonly deps: ProviderManagerDeps) {
    this.store = new ProviderAccountStore(deps.accountsFile)
  }

  list(providerId?: string): ProviderConnection[] {
    return this.store.list(providerId)
  }

  async startLogin(providerId: string): Promise<{ loginId: string; authUrl: string; expiresIn: number }> {
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
    if (providerId !== 'openai' || account.authMode !== 'oauth' || !account.keyRef) {
      return account.usage ?? { accountId: account.id, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'Provider quota adapter unavailable' }
    }
    const secret = this.store.getSecret(account.id)
    if (!secret?.accessToken) return { accountId: account.id, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: 'OAuth access token unavailable' }
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${secret.accessToken}`, originator: 'codex_vscode', 'user-agent': 'codex_vscode/0.146.0', accept: 'application/json' }
      if (secret.accountId) headers['ChatGPT-Account-ID'] = secret.accountId
      const endpoints = ['https://chatgpt.com/backend-api/codex/usage', 'https://chatgpt.com/backend-api/wham/usage']
      let lastStatus = 0
      for (const endpoint of endpoints) {
        const response = await fetch(endpoint, { headers })
        if (!response.ok) { lastStatus = response.status; continue }
        const normalized = normalizeOpenAICodexUsage(account.id, await response.json())
        account.usage = normalized
        this.store.setUsage(account.id, normalized)
        return normalized
      }
      return { accountId: account.id, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: `Quota request failed (${lastStatus || 'network error'})` }
    } catch (error) {
      return { accountId: account.id, refreshedAt: Date.now(), source: 'unavailable', status: 'unavailable', unavailableReason: String(error) }
    }
  }

  close(): void {
    for (const loginId of this.pending.keys()) this.cancelLogin(loginId)
  }

  static callbackUri(): string {
    return CODEX_REDIRECT_URI
  }
}
