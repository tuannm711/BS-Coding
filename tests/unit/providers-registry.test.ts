import { describe, expect, it } from 'vitest'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createFixtureAdapter } from '../../src/main/providers/adapters/fixture'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { createGitHubCopilotAdapter } from '../../src/main/providers/adapters/github-copilot'
import { createOpenAiCompatibleAdapter } from '../../src/main/providers/adapters/openai-compatible'
import type { ProviderAdapter } from '../../src/main/providers/types'

describe('ProviderRegistry', () => {
  it('lists only ready adapter capabilities and resolves methods', () => {
    const registry = new ProviderRegistry()
    registry.register(createFixtureAdapter())
    expect(registry.listReady().map(item => item.id)).toEqual(['fixture'])
    expect(registry.methods('fixture').map(item => item.id)).toEqual(['api-key', 'imported'])
    expect(registry.get('missing')).toBeUndefined()
  })

  it('rejects duplicate provider ids', () => {
    const registry = new ProviderRegistry()
    registry.register(createFixtureAdapter())
    expect(() => registry.register(createFixtureAdapter())).toThrow('already registered')
  })

  it('rejects a visible OAuth method without an authorization strategy', () => {
    const invalid: ProviderAdapter = {
      capability: { id: 'invalid-oauth', displayName: 'Invalid', status: 'ready', chatTransport: 'openai-compatible', methods: [{ id: 'oauth', label: 'OAuth', description: '', kind: 'oauth', fields: [] }] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { return [] },
      createRuntime() { throw new Error('not used') }
    }

    expect(() => new ProviderRegistry().register(invalid)).toThrow('exposes OAuth without an authorization strategy')
  })

  it('rejects a ready or experimental adapter without a declared chat transport', () => {
    const invalid = createFixtureAdapter()
    delete (invalid.capability as { chatTransport?: string }).chatTransport
    expect(() => new ProviderRegistry().register(invalid)).toThrow('chat transport')
  })

  it('declares the exact chat transport for every adapter class', () => {
    expect((createOpenAiAdapter().capability as any).chatTransport).toBe('openai-responses')
    expect((createAntigravityAdapter().capability as any).chatTransport).toBe('cloud-code')
    expect((createGitHubCopilotAdapter().capability as any).chatTransport).toBe('openai-compatible')
    expect((createOpenAiCompatibleAdapter('cursor', 'Cursor').capability as any).chatTransport).toBe('openai-compatible')
  })
})
