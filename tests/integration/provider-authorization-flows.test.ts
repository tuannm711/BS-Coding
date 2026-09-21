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

  it('creates and manages ChatGPT OAuth and Device Code authorization sessions via ProviderManager', async () => {
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

      // Test 1: Browser OAuth flow via manager.createAuthorization
      const session = await manager.createAuthorization({
        providerId: 'openai',
        methodId: 'oauth'
      })

      expect(session.loginId).toBeTruthy()
      expect(session.status).toBe('waiting')
      expect(session.authUrl).toContain('https://auth.openai.com/oauth/authorize')

      await manager.openAuthorization(session.loginId)
      expect(openExternal).toHaveBeenCalledWith(session.authUrl)

      manager.cancelAuthorization(session.loginId)

      // Test 2: Device code flow via manager.createAuthorization
      const deviceSession = await manager.createAuthorization({
        providerId: 'openai',
        methodId: 'chatgpt-device-code'
      })

      expect(deviceSession.loginId).toBeTruthy()
      expect(deviceSession.status).toBe('waiting')
      expect(deviceSession.verificationUrl).toContain('openai.com')
      expect(deviceSession.userCode).toBeTruthy()

      manager.cancelAuthorization(deviceSession.loginId)

      // Test 3: manager.connectMethod delegates to createAuthorization for OAuth
      const connectResult = await manager.connectMethod({
        providerId: 'openai',
        methodId: 'oauth',
        fields: {}
      })

      expect(connectResult.loginId).toBeTruthy()
      expect(connectResult.requiresBrowser).toBe(true)
      expect(connectResult.authUrl).toContain('https://auth.openai.com/oauth/authorize')

      if (connectResult.loginId) {
        manager.cancelAuthorization(connectResult.loginId)
      }
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })
})
