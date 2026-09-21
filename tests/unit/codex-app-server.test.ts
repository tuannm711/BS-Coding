import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { CodexAppServerClient, resolveCodexExecutablePath } from '../../src/main/connections/codex-app-server'

describe('CodexAppServerClient & Multi-Account Isolation', () => {
  let tmpDirs: string[] = []

  function makeTmpHome(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bs-codex-test-'))
    tmpDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
    tmpDirs = []
  })

  it('resolves system executable path', () => {
    const execPath = resolveCodexExecutablePath()
    expect(execPath).toBeTruthy()
  })

  it('starts codex app-server in isolated CODEX_HOME without touching global .codex', async () => {
    const isolatedHome = makeTmpHome()
    const client = new CodexAppServerClient({ codexHome: isolatedHome })

    try {
      await client.start()
      expect(client.isRunning).toBe(true)

      const accInfo = await client.readAccount()
      expect(accInfo).toHaveProperty('requiresOpenaiAuth')

      // Check isolated directory contents
      const files = readdirSync(isolatedHome)
      expect(files.length).toBeGreaterThan(0)
    } finally {
      client.stop()
      expect(client.isRunning).toBe(false)
    }
  })

  it('supports account/login/start and cancelLogin', async () => {
    const isolatedHome = makeTmpHome()
    const client = new CodexAppServerClient({ codexHome: isolatedHome })

    try {
      await client.start()
      const login = await client.startLogin('chatgpt')
      expect(login).toHaveProperty('loginId')
      expect(login).toHaveProperty('authUrl')
      expect(login.authUrl).toContain('https://auth.openai.com/oauth/authorize')

      const cancel = await client.cancelLogin(login.loginId)
      expect(cancel).toMatchObject({ status: 'canceled' })
    } finally {
      client.stop()
    }
  })

  it('keeps multi-account homes completely separate', async () => {
    const homeA = makeTmpHome()
    const homeB = makeTmpHome()

    const clientA = new CodexAppServerClient({ codexHome: homeA })
    const clientB = new CodexAppServerClient({ codexHome: homeB })

    try {
      await clientA.start()
      await clientB.start()

      expect(clientA.codexHome).not.toEqual(clientB.codexHome)
      expect(clientA.codexHome).toBe(homeA)
      expect(clientB.codexHome).toBe(homeB)
    } finally {
      clientA.stop()
      clientB.stop()
    }
  })
})
