import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { ProviderManager } from '../../src/main/connections/manager'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'

function fakeVault() {
  const secrets = new Map<string, string>()
  return {
    saveSecret: (k: string, v: string) => secrets.set(k, v),
    getSecret: (k: string) => secrets.get(k) ?? null,
    deleteSecret: (k: string) => secrets.delete(k)
  }
}

describe('isolated protocol smoke verification', () => {
  it('runs non-interactive device-code handshake in isolation without touching global state', async () => {
    // Check global paths
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
    const globalBs = path.join(appData, 'BS Coding')
    const userProfile = process.env.USERPROFILE || ''
    const globalCodex = path.join(userProfile, '.codex')

    const globalBsMtimeBefore = existsSync(globalBs) ? statSync(globalBs).mtimeMs : null
    const globalCodexMtimeBefore = existsSync(globalCodex) ? statSync(globalCodex).mtimeMs : null

    const isolatedUserData = mkdtempSync(path.join(tmpdir(), 'bs-smoke-userdata-'))

    try {
      const registry = new ProviderRegistry()
      const adapter = createOpenAiAdapter({ userDataDir: isolatedUserData })
      registry.register(adapter)

      const manager = new ProviderManager({
        accountsFile: path.join(isolatedUserData, 'accounts.json'),
        registry,
        vault: fakeVault() as never
      })

      // 1. Start chatgpt-device-code authorization
      const session = await manager.createAuthorization({
        providerId: 'openai',
        methodId: 'chatgpt-device-code'
      })

      expect(session.loginId).toBeTruthy()
      expect(session.userCode).toBeTruthy()
      expect(session.verificationUrl).toContain('openai.com')
      expect(session.authUrl).toBeTruthy()
      expect(session.status).toBe('waiting')

      // 2. Cancel session
      const cancelled = manager.cancelAuthorization(session.loginId)
      expect(cancelled?.status).toBe('cancelled')

      // 3. Check isolated directory contents
      const provDir = path.join(isolatedUserData, 'providers', 'openai')
      expect(existsSync(provDir)).toBe(true)
      const accounts = readdirSync(provDir)
      expect(accounts.length).toBeGreaterThan(0)

      // 4. Verify global paths untouched
      const globalBsMtimeAfter = existsSync(globalBs) ? statSync(globalBs).mtimeMs : null
      const globalCodexMtimeAfter = existsSync(globalCodex) ? statSync(globalCodex).mtimeMs : null

      expect(globalBsMtimeAfter).toBe(globalBsMtimeBefore)
      expect(globalCodexMtimeAfter).toBe(globalCodexMtimeBefore)
    } finally {
      try {
        rmSync(isolatedUserData, { recursive: true, force: true })
      } catch {
        // ignore Windows file locks on temp dir
      }
    }
  })
})
