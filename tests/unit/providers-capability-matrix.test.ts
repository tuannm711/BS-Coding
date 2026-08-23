import { describe, expect, it } from 'vitest'
import { createOpenAiCompatibleAdapter } from '../../src/main/providers/adapters/openai-compatible'

describe('OpenAI-compatible provider adapters', () => {
  it('normalizes imported credentials without exposing the JSON as the API key', async () => {
    const adapter = createOpenAiCompatibleAdapter('grok', 'Grok / xAI', true)
    let saved: { secrets?: { apiKey?: string; baseUrl?: string } } = {}
    const result = await adapter.connect({ providerId: 'grok', methodId: 'imported', fields: { credentialJson: JSON.stringify({ accessToken: 'token', baseUrl: 'https://example.test/v1' }) } }, {
      saveAccount: (account, secrets) => { saved = { secrets }; return { ...account, id: 'a1', createdAt: 1, lastUsedAt: 1 } }
    })
    expect(result.account.id).toBe('a1')
    expect(saved.secrets).toEqual({ accessToken: 'token', baseUrl: 'https://example.test/v1', apiKey: undefined, accountId: undefined })
  })
})
