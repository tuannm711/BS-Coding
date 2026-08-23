import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ProviderAccount, ProviderConnection } from '../../shared/types'
import type { ProviderSecrets, StoredProviderAccounts } from './types'
import { Vault } from '../vault'

export class ProviderAccountStore {
  private readonly vault: Vault

  constructor(private readonly file: string, vault = new Vault(path.join(path.dirname(file), 'vault.json'))) {
    this.vault = vault
  }

  list(providerId?: string): ProviderConnection[] {
    const connections = this.load().connections
    return providerId ? connections.filter(c => c.providerId === providerId) : connections
  }

  get(accountId: string): ProviderAccount | null {
    for (const connection of this.load().connections) {
      const account = connection.accounts.find(a => a.id === accountId)
      if (account) return account
    }
    return null
  }

  getSecret(accountId: string): ProviderSecrets | null {
    const account = this.get(accountId)
    if (!account?.keyRef) return null
    const raw = this.vault.getSecret(account.keyRef)
    if (!raw) return null
    try {
      return JSON.parse(raw) as ProviderSecrets
    } catch {
      return { apiKey: raw }
    }
  }

  upsert(input: Omit<ProviderAccount, 'id' | 'createdAt' | 'lastUsedAt'> & Partial<Pick<ProviderAccount, 'id' | 'createdAt' | 'lastUsedAt'>>, secrets?: ProviderSecrets): ProviderAccount {
    const now = Date.now()
    const account: ProviderAccount = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: input.createdAt ?? now,
      lastUsedAt: input.lastUsedAt ?? now
    }
    if (secrets) {
      const keyRef = account.keyRef ?? `account:${account.id}`
      this.vault.saveSecret(keyRef, JSON.stringify(secrets))
      account.keyRef = keyRef
    }
    const state = this.load()
    const connection = state.connections.find(c => c.providerId === account.providerId)
    if (connection) {
      const index = connection.accounts.findIndex(a => a.id === account.id)
      if (index >= 0) connection.accounts[index] = account
      else connection.accounts.push(account)
      if (account.status === 'active') connection.activeAccountId = account.id
    } else {
      state.connections.push({ providerId: account.providerId, accounts: [account], activeAccountId: account.status === 'active' ? account.id : null })
    }
    this.save(state)
    return account
  }

  setEnabled(accountId: string, enabled: boolean): void {
    const state = this.load()
    const found = this.find(state.connections, accountId)
    if (!found) return
    found.account.status = enabled ? 'active' : 'disabled'
    if (enabled) found.connection.activeAccountId = accountId
    else if (found.connection.activeAccountId === accountId) found.connection.activeAccountId = null
    this.save(state)
  }

  switchActive(providerId: string, accountId: string): void {
    const state = this.load()
    const connection = state.connections.find(c => c.providerId === providerId)
    const account = connection?.accounts.find(a => a.id === accountId)
    if (!connection || !account || account.status !== 'active') throw new Error('[bs] Account không khả dụng')
    for (const item of connection.accounts) {
      if (item.id !== accountId && item.status === 'active') item.status = 'disabled'
    }
    account.status = 'active'
    account.lastUsedAt = Date.now()
    connection.activeAccountId = accountId
    this.save(state)
  }

  remove(accountId: string): void {
    const state = this.load()
    const found = this.find(state.connections, accountId)
    if (!found) return
    found.connection.accounts = found.connection.accounts.filter(a => a.id !== accountId)
    if (found.connection.activeAccountId === accountId) found.connection.activeAccountId = null
    if (found.account.keyRef) this.vault.deleteSecret(found.account.keyRef)
    state.connections = state.connections.filter(c => c.accounts.length > 0)
    this.save(state)
  }

  private find(connections: ProviderConnection[], accountId: string): { connection: ProviderConnection; account: ProviderAccount } | null {
    for (const connection of connections) {
      const account = connection.accounts.find(a => a.id === accountId)
      if (account) return { connection, account }
    }
    return null
  }

  private load(): StoredProviderAccounts {
    if (!existsSync(this.file)) return { version: 1, connections: [] }
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf-8')) as Partial<StoredProviderAccounts>
      if (parsed.version === 1 && Array.isArray(parsed.connections)) return parsed as StoredProviderAccounts
    } catch { /* corrupted state is replaced with an empty store */ }
    return { version: 1, connections: [] }
  }

  private save(state: StoredProviderAccounts): void {
    mkdirSync(path.dirname(this.file), { recursive: true })
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(temp, JSON.stringify(state, null, 2))
    renameSync(temp, this.file)
  }
}
