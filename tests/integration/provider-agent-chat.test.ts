import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createGoogleAdapter } from '../../src/main/providers/adapters/google'

function fakeVault() {
  const secrets = new Map<string, string>()
  return { saveSecret: (ref: string, value: string) => secrets.set(ref, value), getSecret: (ref: string) => secrets.get(ref) ?? null, deleteSecret: (ref: string) => secrets.delete(ref) }
}

describe('provider agent chat integration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('authorizes Google Gemini provider and persists account', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-google-chat-'))
    try {
      const registry = new ProviderRegistry()
      registry.register(createGoogleAdapter())
      const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: fakeVault() as any })

      const res = await manager.registry.get('google')?.connect({
        providerId: 'google',
        methodId: 'gemini-api-key',
        fields: { apiKey: 'AIzaSyTest123456' }
      }, {
        saveAccount: (account, secrets) => manager.store.upsert({ id: 'acc_gemini', ...account as any }, secrets as any)
      })

      expect(res?.account.providerId).toBe('google')
      expect(manager.list('google')[0].accounts[0].status).toBe('active')
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })
})
