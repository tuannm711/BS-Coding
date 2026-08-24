import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import type { ProviderAdapter } from '../../src/main/providers/types'

function fakeVault() {
  const secrets = new Map<string, string>()
  return { saveSecret: (ref: string, value: string) => secrets.set(ref, value), getSecret: (ref: string) => secrets.get(ref) ?? null, deleteSecret: (ref: string) => secrets.delete(ref) }
}

describe('staged provider account refresh', () => {
  it('keeps valid models when discovery fails while preserving profile and usage stages', async () => {
    const adapter: ProviderAdapter = {
      capability: { id: 'staged', displayName: 'Staged', status: 'ready', chatTransport: 'openai-compatible', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return { ...account, profile: { ...account.profile, planName: 'Pro' } } },
      async listModels() { throw new Error('model endpoint unavailable') },
      createRuntime() { throw new Error('not used') },
      async fetchUsage(account) { return { accountId: account.id, requestsUsed: 5, refreshedAt: 10, source: 'provider', status: 'ok' } }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-provider-refresh-'))
    const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'staged', label: 'Account', authMode: 'api-key', status: 'active', models: ['old-code'], modelCatalog: [{ id: 'old-code', name: 'Old Code' }] }, { apiKey: 'secret' })

    const result = await manager.refreshAccount('staged', account.id)
    const refreshed = result.accounts.find(item => item.id === account.id)!

    expect(refreshed.profile?.planName).toBe('Pro')
    expect(refreshed.models.map(model => [model.id, model.name])).toEqual([['old-code', 'Old Code']])
    expect(refreshed.usage).toMatchObject({ requestsUsed: 5, source: 'provider', status: 'ok' })
    expect(refreshed.error?.message).toContain('model endpoint unavailable')
    expect(refreshed.refreshStages).toEqual({ credentials: 'ready', models: 'error', usage: 'ready' })
  })

  it('does not reactivate an account disabled while credentials refresh is in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const adapter: ProviderAdapter = {
      capability: { id: 'race', displayName: 'Race', status: 'ready', chatTransport: 'openai-compatible', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { await gate; return { ...account, profile: { planName: 'Pro' } } },
      async listModels(account) { return (account.models ?? []).map(id => ({ id, name: id })) },
      createRuntime() { throw new Error('not used') }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-provider-refresh-disable-'))
    const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'race', label: 'Account', authMode: 'oauth', status: 'active', models: ['code'] }, { accessToken: 'secret' })

    const refresh = manager.refreshAccount('race', account.id)
    manager.setEnabled(account.id, false)
    release()
    await refresh

    expect(manager.store.get(account.id)).toMatchObject({ status: 'disabled', profile: { planName: 'Pro' } })
  })

  it('does not recreate an account removed while credentials refresh is in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const adapter: ProviderAdapter = {
      capability: { id: 'race-remove', displayName: 'Race remove', status: 'ready', chatTransport: 'openai-compatible', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { await gate; return account },
      async listModels() { return [] },
      createRuntime() { throw new Error('not used') }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-provider-refresh-remove-'))
    const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'race-remove', label: 'Account', authMode: 'oauth', status: 'active' }, { accessToken: 'secret' })

    const refresh = manager.refreshAccount('race-remove', account.id)
    manager.remove(account.id)
    release()

    await expect(refresh).rejects.toThrow(/removed during refresh/i)
    expect(manager.store.get(account.id)).toBeNull()
  })

  it('rotates expired credentials before an independent model refresh', async () => {
    const seenTokens: string[] = []
    const adapter: ProviderAdapter = {
      capability: { id: 'model-token', displayName: 'Model token', status: 'ready', chatTransport: 'openai-compatible', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async refreshCredentials(_account, secret) { return { ...secret, accessToken: 'rotated' } },
      async listModels(_account, secret) { seenTokens.push(secret.accessToken ?? ''); return [{ id: 'new-code', name: 'New Code' }] },
      createRuntime() { throw new Error('not used') }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-provider-model-token-'))
    const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'model-token', label: 'Account', authMode: 'oauth', status: 'active', models: ['old-code'] }, { accessToken: 'expired', refreshToken: 'refresh' })

    await manager.refreshModels('model-token', account.id)

    expect(seenTokens).toEqual(['rotated'])
    expect(manager.store.getSecret(account.id)).toMatchObject({ accessToken: 'rotated' })
    expect(manager.store.get(account.id)?.models).toEqual(['new-code'])
  })

  it('clears a transient discovery error after a later successful model refresh', async () => {
    let fail = true
    const adapter: ProviderAdapter = {
      capability: { id: 'model-recovery', displayName: 'Model recovery', status: 'ready', chatTransport: 'openai-compatible', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { if (fail) throw new Error('temporary discovery failure'); return [{ id: 'recovered-code', name: 'Recovered Code' }] },
      createRuntime() { throw new Error('not used') }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-provider-model-recovery-'))
    const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'model-recovery', label: 'Account', authMode: 'oauth', status: 'active', models: ['old-code'] }, { accessToken: 'token' })

    await manager.refreshModels('model-recovery', account.id)
    expect(manager.getSnapshot().accounts.find(item => item.id === account.id)?.error?.message).toContain('temporary discovery failure')
    fail = false
    await manager.refreshModels('model-recovery', account.id)

    expect(manager.getSnapshot().accounts.find(item => item.id === account.id)?.error).toBeUndefined()
    expect(manager.store.get(account.id)?.models).toEqual(['recovered-code'])
  })
})
