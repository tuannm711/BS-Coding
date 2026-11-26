import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  createClaudeAdapter,
  DEFAULT_CLAUDE_GATEWAY_URL,
  DEFAULT_CLAUDE_AUTH_SCHEMA,
  STATIC_CLAUDE_MODELS
} from '../../src/main/providers/adapters/claude'
import {
  getInitialFields,
  fieldLabel,
  fieldPlaceholder
} from '../../src/renderer/src/components/settings/AddProviderModal'

describe('createClaudeAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exposes definition with gateway and api-key methods', () => {
    const adapter = createClaudeAdapter()
    const def = adapter.definition()
    expect(def.id).toBe('claude')
    expect(def.displayName).toBe('Claude')
    expect(def.chatTransport).toBe('anthropic')
    expect(def.status).toBe('ready')
    expect(def.methods.map(m => m.id)).toEqual(['gateway', 'api-key'])
  })

  it('connects via gateway method with default baseUrl and authSchema', async () => {
    const adapter = createClaudeAdapter()
    let savedAccount: any = null
    let savedSecrets: any = null

    const context = {
      saveAccount: (account: any, secrets: any) => {
        savedAccount = { ...account, id: 'acc-1' }
        savedSecrets = secrets
        return savedAccount
      }
    }

    const result = await adapter.connect(
      {
        providerId: 'claude',
        methodId: 'gateway',
        fields: {
          apiKey: 'test-gateway-api-key'
        }
      },
      context
    )

    expect(result.account.id).toBe('acc-1')
    expect(result.account.providerId).toBe('claude')
    expect(result.account.authMode).toBe('api-key')
    expect(savedSecrets).toEqual({
      apiKey: 'test-gateway-api-key',
      baseUrl: DEFAULT_CLAUDE_GATEWAY_URL,
      authSchema: DEFAULT_CLAUDE_AUTH_SCHEMA
    })
    expect(result.account.label).toContain('Claude Gateway')
  })

  it('connects via gateway method with custom baseUrl and custom label', async () => {
    const adapter = createClaudeAdapter()
    let savedSecrets: any = null

    const context = {
      saveAccount: (account: any, secrets: any) => {
        savedSecrets = secrets
        return { ...account, id: 'acc-2' }
      }
    }

    const result = await adapter.connect(
      {
        providerId: 'claude',
        methodId: 'gateway',
        fields: {
          apiKey: 'custom-key',
          baseUrl: 'https://my-custom-gateway.com/v1',
          authSchema: 'Bearer',
          label: 'My Custom Claude'
        }
      },
      context
    )

    expect(result.account.label).toBe('My Custom Claude')
    expect(savedSecrets).toEqual({
      apiKey: 'custom-key',
      baseUrl: 'https://my-custom-gateway.com/v1',
      authSchema: 'Bearer'
    })
  })

  it('rejects connection if apiKey is missing', async () => {
    const adapter = createClaudeAdapter()
    const context = { saveAccount: vi.fn() }

    await expect(
      adapter.connect({ providerId: 'claude', methodId: 'gateway', fields: {} }, context)
    ).rejects.toThrow('Gateway API key không được để trống')

    await expect(
      adapter.connect({ providerId: 'claude', methodId: 'api-key', fields: {} }, context)
    ).rejects.toThrow('Claude API key không được để trống')
  })

  it('lists static models when fetch fails or is not available', async () => {
    const adapter = createClaudeAdapter()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const mockAccount = {
      id: 'a1',
      providerId: 'claude',
      label: 'Claude',
      authMode: 'api-key' as const,
      status: 'active' as const,
      createdAt: 1,
      lastUsedAt: 1
    }

    const models = await adapter.listModels(mockAccount, {
      apiKey: 'test-key',
      baseUrl: DEFAULT_CLAUDE_GATEWAY_URL
    })
    expect(models.map(m => m.id)).toEqual(STATIC_CLAUDE_MODELS.map(m => m.id))
  })

  it('lists remote models when gateway /models endpoint responds', async () => {
    const adapter = createClaudeAdapter()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-3-7-sonnet-20250219', display_name: 'Claude 3.7 Sonnet' },
            { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku' }
          ]
        })
      })
    )

    const mockAccount = {
      id: 'a1',
      providerId: 'claude',
      label: 'Claude',
      authMode: 'api-key' as const,
      status: 'active' as const,
      createdAt: 1,
      lastUsedAt: 1
    }

    const models = await adapter.listModels(mockAccount, {
      apiKey: 'test-key',
      baseUrl: DEFAULT_CLAUDE_GATEWAY_URL
    })
    expect(models).toHaveLength(2)
    expect(models[0].id).toBe('claude-3-7-sonnet-20250219')
    expect(models[0].name).toBe('Claude 3.7 Sonnet')
  })

  it('creates runtime llm client', () => {
    const adapter = createClaudeAdapter()
    const runtime = adapter.createRuntime(
      {
        id: 'acc-1',
        providerId: 'claude',
        label: 'Test',
        authMode: 'api-key',
        status: 'active',
        createdAt: 1,
        lastUsedAt: 1
      },
      {
        apiKey: 'test-key',
        baseUrl: DEFAULT_CLAUDE_GATEWAY_URL,
        authSchema: 'x-api-key'
      },
      STATIC_CLAUDE_MODELS[0]
    )
    expect(runtime).toBeDefined()
    expect(typeof runtime.stream).toBe('function')
  })
})

describe('AddProviderModal field helpers for Claude', () => {
  it('supplies default fields for claude gateway method', () => {
    const defaults = getInitialFields('claude', 'gateway')
    expect(defaults).toEqual({
      baseUrl: 'https://api.agentshop247.com/api/claude',
      authSchema: 'x-api-key'
    })
  })

  it('provides exact labels matching the configuration design', () => {
    expect(fieldLabel('claude', 'gateway', 'baseUrl')).toBe('base_url Claude API')
    expect(fieldLabel('claude', 'gateway', 'apiKey')).toBe('Gateway API key')
    expect(fieldLabel('claude', 'gateway', 'authSchema')).toBe('Gateway auth schema')
    expect(fieldPlaceholder('claude', 'gateway', 'baseUrl')).toBe(
      'https://api.agentshop247.com/api/claude'
    )
    expect(fieldPlaceholder('claude', 'gateway', 'authSchema')).toBe('x-api-key')
  })
})
