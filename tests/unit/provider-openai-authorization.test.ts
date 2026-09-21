import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'

describe('OpenAI provider authorization via Codex App Server', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('exposes oauth and api-key methods in definition', () => {
    const adapter = createOpenAiAdapter()
    const def = adapter.definition()
    expect(def.id).toBe('openai')
    expect(def.methods.map(m => m.id)).toContain('oauth')
    expect(def.methods.map(m => m.id)).toContain('api-key')
  })

  it('connects api-key method directly', async () => {
    const adapter = createOpenAiAdapter()
    const saved: any[] = []
    const context = {
      saveAccount: (account: any, secrets: any) => {
        const item = { id: 'acc_api', ...account }
        saved.push({ item, secrets })
        return item
      }
    }

    const res = await adapter.connect({
      providerId: 'openai',
      methodId: 'api-key',
      fields: { apiKey: 'sk-test12345' }
    }, context)

    expect(res.account).toBeDefined()
    expect(res.account.authMode).toBe('api-key')
    expect(saved[0].secrets.apiKey).toBe('sk-test12345')
  })

  it('starts ChatGPT login session using Codex App Server in isolated userDataDir', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'bs-openai-test-'))
    try {
      const adapter = createOpenAiAdapter({ userDataDir: tmpDir })
      const context = {
        saveAccount: (account: any, secrets: any) => {
          return { id: account.id || 'acc_oauth', ...account }
        }
      }

      const res = await adapter.connect({
        providerId: 'openai',
        methodId: 'oauth',
        fields: {}
      }, context)

      expect(res.account).toBeDefined()
      expect(res.login).toBeDefined()
      expect(res.login?.authUrl).toContain('https://auth.openai.com/oauth/authorize')
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // ignore Windows file locks on temp dir
      }
    }
  })
})
