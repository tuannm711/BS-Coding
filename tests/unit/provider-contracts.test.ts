import { describe, expect, it } from 'vitest'
import { providerCanUseMethod, providerModelKey, type ProviderCapability, type ProviderModel } from '../../src/shared/providers'

describe('provider contracts', () => {
  it('only exposes declared authentication methods', () => {
    const capability: ProviderCapability = {
      id: 'fixture',
      displayName: 'Fixture',
      methods: [{ id: 'api-key', label: 'API key', description: 'Key', kind: 'api-key', fields: ['apiKey'] }],
      status: 'ready'
    }
    expect(providerCanUseMethod(capability, 'api-key')).toBe(true)
    expect(providerCanUseMethod(capability, 'oauth')).toBe(false)
  })

  it('creates a stable provider/account/model key', () => {
    const model: ProviderModel = { id: 'gpt-code', name: 'GPT Code', capabilities: { isCodeModel: true, supportsStreaming: true } }
    expect(providerModelKey('openai', 'account-1', model.id)).toBe('openai/account-1/gpt-code')
  })
})
