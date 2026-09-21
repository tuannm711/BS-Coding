import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'
import { CodexAppServerClient } from '../../src/main/connections/codex-app-server'
import type { ProviderManagedAuthorizationStrategy } from '../../src/main/providers/types'
import type { ProviderAccount } from '../../src/shared/types'

describe('OpenAI provider authorization via Codex App Server', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('exposes oauth, chatgpt-device-code, and api-key methods in definition', () => {
    const adapter = createOpenAiAdapter()
    const def = adapter.definition()
    expect(def.id).toBe('openai')
    const methodIds = def.methods.map(m => m.id)
    expect(methodIds).toContain('oauth')
    expect(methodIds).toContain('chatgpt-device-code')
    expect(methodIds).toContain('api-key')
  })

  it('declares supportsTools: false on all models in the catalog', () => {
    const adapter = createOpenAiAdapter()
    const models = (adapter.capability as any).models || adapter.definition().methods
    const dummyAccount: ProviderAccount = {
      id: 'acc_test',
      providerId: 'openai',
      label: 'OpenAI Test',
      authMode: 'oauth',
      status: 'active',
      createdAt: 1,
      lastUsedAt: 1
    }
    // Check modelCatalog via listModels
    return adapter.listModels(dummyAccount, { codexHome: 'C:/fake' }).then(catalog => {
      expect(catalog.length).toBeGreaterThan(0)
      for (const m of catalog) {
        expect(m.capabilities?.supportsTools).toBe(false)
      }
    })
  })

  it('connects api-key method directly with active status', async () => {
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
    expect(res.account.status).toBe('active')
    expect(saved[0].secrets.apiKey).toBe('sk-test12345')
  })

  it('starts ChatGPT browser login without prematurely stopping client', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'bs-openai-test-'))
    try {
      const adapter = createOpenAiAdapter({ userDataDir: tmpDir })
      const strategy = adapter.authorization as ProviderManagedAuthorizationStrategy
      expect(strategy).toBeDefined()
      expect(strategy.kind).toBe('managed')

      const savedAccounts: any[] = []
      const context = {
        saveAccount: vi.fn((acc: any) => {
          savedAccounts.push(acc)
          return acc
        }),
        onConnected: vi.fn(),
        onError: vi.fn()
      }

      const session = await strategy.start({
        providerId: 'openai',
        methodId: 'oauth'
      }, context)

      expect(session.loginId).toBeTruthy()
      expect(session.authUrl).toContain('https://auth.openai.com/oauth/authorize')
      expect(session.expiresAt).toBeGreaterThan(Date.now())

      // Close stops and cleans up
      session.close()
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // ignore Windows file locks on temp dir
      }
    }
  })

  it('starts device code login with verificationUrl and userCode', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'bs-openai-test-'))
    try {
      const adapter = createOpenAiAdapter({ userDataDir: tmpDir })
      const strategy = adapter.authorization as ProviderManagedAuthorizationStrategy

      const context = {
        saveAccount: vi.fn((acc: any) => acc),
        onConnected: vi.fn(),
        onError: vi.fn()
      }

      const session = await strategy.start({
        providerId: 'openai',
        methodId: 'chatgpt-device-code'
      }, context)

      expect(session.loginId).toBeTruthy()
      expect(session.verificationUrl).toContain('openai.com')
      expect(session.userCode).toBeTruthy()

      session.close()
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // ignore Windows file locks on temp dir
      }
    }
  })

  it('handles account/login/completed success notification and saves active account', async () => {
    let capturedNotificationCb: ((params: any) => void) | null = null
    const startSpy = vi.spyOn(CodexAppServerClient.prototype, 'start').mockResolvedValue(undefined)
    const startLoginSpy = vi.spyOn(CodexAppServerClient.prototype, 'startLogin').mockResolvedValue({
      type: 'chatgpt',
      loginId: 'login_mock_123',
      authUrl: 'https://auth.openai.com/oauth/authorize?mock=1'
    })
    const readAccountSpy = vi.spyOn(CodexAppServerClient.prototype, 'readAccount').mockResolvedValue({
      account: {
        email: 'user@example.com',
        planType: 'plus'
      } as any
    })
    const onNotificationSpy = vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method, cb) => {
      if (method === 'account/login/completed') {
        capturedNotificationCb = cb
      }
      return () => {}
    })
    const stopSpy = vi.spyOn(CodexAppServerClient.prototype, 'stop').mockImplementation(() => {})

    const adapter = createOpenAiAdapter()
    const strategy = adapter.authorization as ProviderManagedAuthorizationStrategy

    const savedAccounts: any[] = []
    const context = {
      saveAccount: vi.fn((acc: any) => {
        savedAccounts.push(acc)
        return acc
      }),
      onConnected: vi.fn(),
      onError: vi.fn()
    }

    const session = await strategy.start({
      providerId: 'openai',
      methodId: 'oauth'
    }, context)

    expect(session.loginId).toBe('login_mock_123')
    expect(capturedNotificationCb).toBeTruthy()

    // Trigger completion notification
    capturedNotificationCb!({
      loginId: 'login_mock_123',
      success: true
    })
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(readAccountSpy).toHaveBeenCalled()
    expect(context.saveAccount).toHaveBeenCalled()
    expect(savedAccounts[0]).toMatchObject({
      providerId: 'openai',
      label: 'user@example.com',
      authMode: 'oauth',
      status: 'active',
      profile: {
        email: 'user@example.com',
        planName: 'plus'
      }
    })
    expect(context.onConnected).toHaveBeenCalledWith({
      loginId: 'login_mock_123',
      account: expect.objectContaining({ status: 'active' })
    })
    expect(stopSpy).toHaveBeenCalled()
  })

  it('handles account/login/completed failure notification and calls onError', async () => {
    let capturedNotificationCb: ((params: any) => void) | null = null
    vi.spyOn(CodexAppServerClient.prototype, 'start').mockResolvedValue(undefined)
    vi.spyOn(CodexAppServerClient.prototype, 'startLogin').mockResolvedValue({
      type: 'chatgpt',
      loginId: 'login_fail_123',
      authUrl: 'https://auth.openai.com/oauth/authorize?mock=1'
    })
    vi.spyOn(CodexAppServerClient.prototype, 'onNotification').mockImplementation((method, cb) => {
      if (method === 'account/login/completed') {
        capturedNotificationCb = cb
      }
      return () => {}
    })
    const stopSpy = vi.spyOn(CodexAppServerClient.prototype, 'stop').mockImplementation(() => {})

    const adapter = createOpenAiAdapter()
    const strategy = adapter.authorization as ProviderManagedAuthorizationStrategy

    const context = {
      saveAccount: vi.fn((acc: any) => acc),
      onConnected: vi.fn(),
      onError: vi.fn()
    }

    await strategy.start({
      providerId: 'openai',
      methodId: 'oauth'
    }, context)

    // Trigger failure notification
    await capturedNotificationCb!({
      loginId: 'login_fail_123',
      success: false,
      error: 'User denied authorization'
    })

    expect(context.onError).toHaveBeenCalledWith({
      loginId: 'login_fail_123',
      error: {
        kind: 'authorization-denied',
        message: 'User denied authorization'
      }
    })
    expect(stopSpy).toHaveBeenCalled()
  })

  it('fetchUsage returns mapped rate limits and quota for OAuth accounts', async () => {
    vi.spyOn(CodexAppServerClient.prototype, 'readRateLimits').mockResolvedValue({
      rateLimits: {
        primary: { usedPercent: 42, resetsAt: 1700000000 },
        secondary: { usedPercent: 10, resetsAt: 1700086400 },
        planType: 'plus'
      },
      rateLimitResetCredits: {
        available: 2,
        applicable: 1
      }
    })
    vi.spyOn(CodexAppServerClient.prototype, 'readUsage').mockResolvedValue({
      summary: {
        lifetimeTokens: '150000'
      }
    })

    const adapter = createOpenAiAdapter()
    const account: ProviderAccount = {
      id: 'acc_oauth_usage',
      providerId: 'openai',
      label: 'test@example.com',
      authMode: 'oauth',
      status: 'active',
      createdAt: 1,
      lastUsedAt: 1
    }

    const usage = await adapter.fetchUsage!(account, { codexHome: 'C:/fake/path' })
    expect(usage.status).toBe('ok')
    expect(usage.primaryUsedPercent).toBe(42)
    expect(usage.secondaryUsedPercent).toBe(10)
    expect(usage.resetAt).toBe(1700000000 * 1000)
    expect(usage.resetCredits).toEqual({ available: 2, applicable: 1 })
    expect(usage.tokensInput).toBe(150000)
    expect(usage.planName).toBe('plus')
  })

  it('fetchUsage returns unavailable for API key accounts', async () => {
    const adapter = createOpenAiAdapter()
    const account: ProviderAccount = {
      id: 'acc_api_usage',
      providerId: 'openai',
      label: 'API Account',
      authMode: 'api-key',
      status: 'active',
      createdAt: 1,
      lastUsedAt: 1
    }

    const usage = await adapter.fetchUsage!(account, { apiKey: 'sk-test' })
    expect(usage.status).toBe('unavailable')
    expect(usage.statusReason).toContain('API key')
  })

  it('connect() throws error on oauth and chatgpt-device-code', async () => {
    const adapter = createOpenAiAdapter()
    const context = { saveAccount: vi.fn() }
    await expect(adapter.connect({
      providerId: 'openai',
      methodId: 'oauth',
      fields: {}
    }, context)).rejects.toThrow('[bs] ChatGPT authentication must use managed authorization')

    await expect(adapter.connect({
      providerId: 'openai',
      methodId: 'chatgpt-device-code',
      fields: {}
    }, context)).rejects.toThrow('[bs] ChatGPT authentication must use managed authorization')
  })

  it('refreshAccount handles logged out / requiresOpenaiAuth, error, and active states', async () => {
    const adapter = createOpenAiAdapter()
    const baseAccount: ProviderAccount = {
      id: 'acc_oauth_1',
      providerId: 'openai',
      label: 'Old Label',
      authMode: 'oauth',
      status: 'active',
      createdAt: 1,
      lastUsedAt: 1
    }

    // Missing codexHome -> error
    const noHome = await adapter.refreshAccount(baseAccount, {})
    expect(noHome.status).toBe('error')
    expect(noHome.lastError).toContain('Codex home directory is missing')

    // requiresOpenaiAuth: true -> expired
    vi.spyOn(CodexAppServerClient.prototype, 'readAccount').mockResolvedValueOnce({
      account: null,
      requiresOpenaiAuth: true
    })
    const expired1 = await adapter.refreshAccount(baseAccount, { codexHome: 'C:/fake' })
    expect(expired1.status).toBe('expired')
    expect(expired1.lastError).toContain('expired or logged out')

    // account: null -> expired
    vi.spyOn(CodexAppServerClient.prototype, 'readAccount').mockResolvedValueOnce({
      account: null,
      requiresOpenaiAuth: false
    })
    const expired2 = await adapter.refreshAccount(baseAccount, { codexHome: 'C:/fake' })
    expect(expired2.status).toBe('expired')
    expect(expired2.lastError).toContain('expired or logged out')

    // Unexpected error -> error
    vi.spyOn(CodexAppServerClient.prototype, 'readAccount').mockRejectedValueOnce(new Error('Process crashed'))
    const errorRes = await adapter.refreshAccount(baseAccount, { codexHome: 'C:/fake' })
    expect(errorRes.status).toBe('error')
    expect(errorRes.lastError).toContain('Process crashed')

    // Valid authenticated account -> active
    vi.spyOn(CodexAppServerClient.prototype, 'readAccount').mockResolvedValueOnce({
      account: {
        type: 'chatgpt',
        email: 'user@example.com',
        name: 'Test User',
        planType: 'pro'
      } as any
    })
    const activeRes = await adapter.refreshAccount(baseAccount, { codexHome: 'C:/fake' })
    expect(activeRes.status).toBe('active')
    expect(activeRes.label).toBe('user@example.com')
    expect(activeRes.profile?.email).toBe('user@example.com')
    expect(activeRes.profile?.planName).toBe('pro')
  })

  it('fetchUsage handles partial failures gracefully with Promise.allSettled', async () => {
    const adapter = createOpenAiAdapter()
    const account: ProviderAccount = {
      id: 'acc_usage_settled',
      providerId: 'openai',
      label: 'test@example.com',
      authMode: 'oauth',
      status: 'active',
      createdAt: 1,
      lastUsedAt: 1
    }

    // Both reject -> unavailable
    vi.spyOn(CodexAppServerClient.prototype, 'readRateLimits').mockRejectedValueOnce(new Error('Rate limit timeout'))
    vi.spyOn(CodexAppServerClient.prototype, 'readUsage').mockRejectedValueOnce(new Error('Usage not found'))
    const bothFail = await adapter.fetchUsage!(account, { codexHome: 'C:/fake' })
    expect(bothFail.status).toBe('unavailable')
    expect(bothFail.statusReason).toContain('Rate limit timeout')
    expect(bothFail.statusReason).toContain('Usage not found')

    // Rate limit fails, usage succeeds -> ok with partial info
    vi.spyOn(CodexAppServerClient.prototype, 'readRateLimits').mockRejectedValueOnce(new Error('Rate limit failure'))
    vi.spyOn(CodexAppServerClient.prototype, 'readUsage').mockResolvedValueOnce({
      summary: { lifetimeTokens: '50000' }
    })
    const usageOnly = await adapter.fetchUsage!(account, { codexHome: 'C:/fake' })
    expect(usageOnly.status).toBe('ok')
    expect(usageOnly.tokensInput).toBe(50000)
    expect(usageOnly.statusReason).toContain('Rate limits unavailable')

    // Rate limit succeeds, usage fails -> ok with rate limit info
    vi.spyOn(CodexAppServerClient.prototype, 'readRateLimits').mockResolvedValueOnce({
      rateLimits: { primary: { usedPercent: 75, resetsAt: 1700000000 } }
    })
    vi.spyOn(CodexAppServerClient.prototype, 'readUsage').mockRejectedValueOnce(new Error('Usage timeout'))
    const limitsOnly = await adapter.fetchUsage!(account, { codexHome: 'C:/fake' })
    expect(limitsOnly.status).toBe('ok')
    expect(limitsOnly.primaryUsedPercent).toBe(75)
    expect(limitsOnly.statusReason).toContain('Usage summary unavailable')
  })

  it('removeAccount deletes isolated account directory and leaves others untouched', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'bs-openai-remove-'))
    try {
      const adapter = createOpenAiAdapter({ userDataDir: tmpDir })
      const accAHome = path.join(tmpDir, 'providers', 'openai', 'acc_A', 'codex-home')
      const accBHome = path.join(tmpDir, 'providers', 'openai', 'acc_B', 'codex-home')
      const { mkdirSync, writeFileSync, existsSync } = await import('node:fs')
      mkdirSync(accAHome, { recursive: true })
      mkdirSync(accBHome, { recursive: true })
      writeFileSync(path.join(accAHome, 'config.json'), '{}')
      writeFileSync(path.join(accBHome, 'config.json'), '{}')

      const accountA: ProviderAccount = {
        id: 'acc_A',
        providerId: 'openai',
        label: 'Account A',
        authMode: 'oauth',
        status: 'active',
        createdAt: 1,
        lastUsedAt: 1
      }

      await adapter.removeAccount!(accountA, { codexHome: accAHome })

      expect(existsSync(path.join(tmpDir, 'providers', 'openai', 'acc_A'))).toBe(false)
      expect(existsSync(path.join(tmpDir, 'providers', 'openai', 'acc_B'))).toBe(true)
      expect(existsSync(path.join(accBHome, 'config.json'))).toBe(true)
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    }
  })

  it('removeAccount refuses to delete outside isolated account directory', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'bs-openai-guard-'))
    try {
      const adapter = createOpenAiAdapter({ userDataDir: tmpDir })
      const outsideDir = path.join(tmpDir, 'outside-codex')
      const { mkdirSync, writeFileSync, existsSync } = await import('node:fs')
      mkdirSync(outsideDir, { recursive: true })
      writeFileSync(path.join(outsideDir, 'important.txt'), 'data')

      const account: ProviderAccount = {
        id: 'acc_safe',
        providerId: 'openai',
        label: 'Safe Account',
        authMode: 'oauth',
        status: 'active',
        createdAt: 1,
        lastUsedAt: 1
      }

      await adapter.removeAccount!(account, { codexHome: outsideDir })
      // Must not delete outsideDir
      expect(existsSync(outsideDir)).toBe(true)
      expect(existsSync(path.join(outsideDir, 'important.txt'))).toBe(true)
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    }
  })

  it('CodexAppServerLlm passes cwd into thread/start', async () => {
    const { CodexAppServerLlm } = await import('../../src/main/agent/codex-app-server-llm')
    let threadStartParams: any = null
    vi.spyOn(CodexAppServerClient.prototype, 'start').mockResolvedValue(undefined)
    vi.spyOn(CodexAppServerClient.prototype, 'request').mockImplementation(async function(this: any, method: string, params: any) {
      if (method === 'thread/start') {
        threadStartParams = params
        return { thread: { id: 'th_123' } }
      }
      if (method === 'turn/start') {
        this.options?.onNotification?.('turn/completed', { turn: { status: 'completed' } })
        return { turn: { id: 'turn_123' } }
      }
      return {}
    })
    vi.spyOn(CodexAppServerClient.prototype, 'stop').mockImplementation(() => {})

    const llm = new CodexAppServerLlm({ codexHome: 'C:/fake' })
    const gen = llm.stream({
      model: 'o3-mini',
      system: 'system prompt',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      cwd: 'C:/my-project'
    })

    // Advance generator
    await gen.next()
    expect(threadStartParams).toBeDefined()
    expect(threadStartParams.cwd).toBe('C:/my-project')
    expect(threadStartParams.model).toBe('o3-mini')
  })
})
