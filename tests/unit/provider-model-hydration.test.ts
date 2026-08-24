import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createFixtureAdapter } from '../../src/main/providers/adapters/fixture'

function fakeVault() {
  const secrets = new Map<string, string>()
  return { saveSecret: (ref: string, value: string) => secrets.set(ref, value), getSecret: (ref: string) => secrets.get(ref) ?? null, deleteSecret: (ref: string) => secrets.delete(ref) }
}

describe('provider model hydration', () => {
  it('fills models for an existing account when the adapter can discover them', async () => {
    const registry = new ProviderRegistry()
    registry.register(createFixtureAdapter())
    const manager = new ProviderManager({ accountsFile: path.join(mkdtempSync(path.join(tmpdir(), 'bs-provider-hydration-')), 'accounts.json'), registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'fixture', label: 'Existing', authMode: 'imported', status: 'active' }, { apiKey: 'key' })
    expect(manager.store.getSecret(account.id)).toEqual({ apiKey: 'key' })
    await manager.refreshModels('fixture', account.id)
    expect(manager.store.get(account.id)?.models).toEqual(['fixture-code'])
  })
})
