import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'

describe('Antigravity legacy deprecation', () => {
  it('loads legacy antigravity accounts from storage without crashing and marks error status', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-antigravity-dep-'))
    const secrets = new Map<string, any>()
    const vault = {
      saveSecret: (ref: string, value: any) => secrets.set(ref, value),
      getSecret: (ref: string) => secrets.get(ref) ?? null,
      deleteSecret: (ref: string) => secrets.delete(ref)
    }
    try {
      const registry = new ProviderRegistry()
      registry.register(createAntigravityAdapter())
      const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: vault as any })

      manager.store.upsert({
        id: 'account-1',
        providerId: 'antigravity',
        label: 'Legacy Antigravity Account',
        authMode: 'oauth',
        status: 'active',
        createdAt: 1,
        lastUsedAt: 1
      }, { accessToken: 'legacy-token' })

      const snapshot = manager.getSnapshot()
      expect(snapshot.accounts).toHaveLength(1)
      expect(snapshot.accounts[0].providerId).toBe('antigravity')

      // Refreshing legacy account sets error status gracefully
      const refreshedSnapshot = await manager.refreshAccount('antigravity', 'account-1')
      expect(refreshedSnapshot.accounts[0].status).toBe('error')
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })
})
