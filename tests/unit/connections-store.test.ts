import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderAccountStore } from '../../src/main/connections/store'

function fakeVault() {
  const secrets = new Map<string, string>()
  return {
    saveSecret: (ref: string, value: string) => { secrets.set(ref, value) },
    getSecret: (ref: string) => secrets.get(ref) ?? null,
    deleteSecret: (ref: string) => { secrets.delete(ref) }
  }
}

describe('ProviderAccountStore', () => {
  it('stores account metadata separately from encrypted secret storage', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-accounts-'))
    const vault = fakeVault()
    const store = new ProviderAccountStore(path.join(dir, 'accounts.json'), vault as never)
    const account = store.upsert({
      providerId: 'openai', label: 'Work', authMode: 'api-key', status: 'active'
    }, { apiKey: 'secret' })

    expect(store.get(account.id)?.keyRef).toBeTruthy()
    expect(store.getSecret(account.id)).toEqual({ apiKey: 'secret' })
    expect(readFileSync(path.join(dir, 'accounts.json'), 'utf8')).not.toContain('secret')
  })

  it('enables and disables accounts without deleting them', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-accounts-'))
    const store = new ProviderAccountStore(path.join(dir, 'accounts.json'), fakeVault() as never)
    const account = store.upsert({ providerId: 'openai', label: 'Work', authMode: 'oauth', status: 'active' })
    store.setEnabled(account.id, false)
    expect(store.get(account.id)?.status).toBe('disabled')
    store.setEnabled(account.id, true)
    expect(store.list('openai')[0].activeAccountId).toBe(account.id)
  })

  it('reads a reason stored under the old key', () => {
    // unavailableReason was the name before v1.1.7 and is present in real
    // accounts.json files. Accepted on read; only statusReason is written back.
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-accounts-'))
    const file = path.join(dir, 'accounts.json')
    writeFileSync(file, JSON.stringify({
      version: 1,
      connections: [{
        providerId: 'antigravity', activeAccountId: 'a1',
        accounts: [{
          id: 'a1', providerId: 'antigravity', label: 'a@example.com',
          authMode: 'oauth', status: 'active', models: [], createdAt: 1, lastUsedAt: 1,
          usage: { accountId: 'a1', refreshedAt: 1, source: 'unavailable', status: 'unavailable', unavailableReason: 'Quota exhausted' }
        }]
      }]
    }))
    const store = new ProviderAccountStore(file, fakeVault() as never)
    expect(store.get('a1')?.usage?.statusReason).toBe('Quota exhausted')
  })
})
