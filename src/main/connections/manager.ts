import { randomUUID } from 'node:crypto'
import type { ProviderConnection, ProviderUsage } from '../../shared/types'
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

  refreshUsage(_providerId?: string, _accountId?: string): ProviderUsage[] {
    const connections = this.list(_providerId)
    const usage: ProviderUsage[] = []
    for (const connection of connections) {
      for (const account of connection.accounts) {
        if (_accountId && account.id !== _accountId) continue
        if (account.usage) {
          usage.push(account.usage)
          this.deps.onUsage?.(account.usage)
        }
      }
    }
    return usage
  }

  close(): void {
    for (const loginId of this.pending.keys()) this.cancelLogin(loginId)
  }

  static callbackUri(): string {
    return CODEX_REDIRECT_URI
  }
}
