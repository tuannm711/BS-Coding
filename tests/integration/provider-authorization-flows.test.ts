import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'

function fakeVault() {
  const secrets = new Map<string, string>()
  return {
    saveSecret: (ref: string, value: string) => secrets.set(ref, value),
    getSecret: (ref: string) => secrets.get(ref) ?? null,
    deleteSecret: (ref: string) => secrets.delete(ref)
  }
}

describe('provider authorization full flows', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates ChatGPT login session using Codex App Server in isolated directory', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-openai-flow-'))
    try {
      const registry = new ProviderRegistry()
      registry.register(createOpenAiAdapter({ userDataDir: dir }))
      const openExternal = vi.fn()
      const manager = new ProviderManager({
        accountsFile: path.join(dir, 'accounts.json'),
        registry,
        vault: fakeVault() as never,
        openExternal
      })

      const res = await manager.registry.get('openai')?.connect({
        providerId: 'openai',
        methodId: 'oauth',
        fields: {}
      }, {
        saveAccount: (account, secrets) => manager.store.upsert({ id: 'acc_test', ...account as any }, secrets as any)
      })

      expect(res?.login?.authUrl).toContain('https://auth.openai.com/oauth/authorize')
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })
})
