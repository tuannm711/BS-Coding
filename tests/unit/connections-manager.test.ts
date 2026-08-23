import { describe, expect, it } from 'vitest'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createFixtureAdapter } from '../../src/main/providers/adapters/fixture'

function fakeVault() {
  const secrets = new Map<string, string>()
  return { saveSecret: (ref: string, value: string) => secrets.set(ref, value), getSecret: (ref: string) => secrets.get(ref) ?? null, deleteSecret: (ref: string) => secrets.delete(ref) }
}

describe('ProviderManager adapter flow', () => {
  it('connects an account through a registered method', async () => {
    const registry = new ProviderRegistry()
    registry.register(createFixtureAdapter())
    const manager = new ProviderManager({ accountsFile: 'C:/tmp/bs-provider-test/accounts.json', registry, vault: fakeVault() as never })
    const result = await manager.connectMethod({ providerId: 'fixture', methodId: 'api-key', fields: { apiKey: 'fixture-secret', label: 'Local fixture' } })
    expect(result.accountId).toBeTruthy()
    expect(manager.list('fixture')[0].accounts[0].label).toBe('Local fixture')
  })
})
