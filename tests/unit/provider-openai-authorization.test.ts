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
})
