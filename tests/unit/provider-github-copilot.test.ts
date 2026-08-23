import { describe, expect, it } from 'vitest'
import { createGitHubCopilotAdapter } from '../../src/main/providers/adapters/github-copilot'

describe('GitHub Copilot adapter', () => {
  it('declares OAuth and token import without promoting unverified runtime', () => {
    const adapter = createGitHubCopilotAdapter()
    expect(adapter.capability.methods.map(method => method.id)).toEqual(['oauth', 'imported'])
    expect(adapter.capability.status).toBe('experimental')
  })

  it('imports a Copilot token and exposes coding models', async () => {
    const adapter = createGitHubCopilotAdapter()
    const result = await adapter.connect({ providerId: 'github-copilot', methodId: 'imported', fields: { credentialJson: JSON.stringify({ accessToken: 'token' }) } }, {
      saveAccount: (account, secret) => ({ ...account, id: 'copilot-1', createdAt: 1, lastUsedAt: 1, models: ['gpt-4.1'], keyRef: secret?.accessToken })
    })
    expect(result.account.id).toBe('copilot-1')
    expect((await adapter.listModels(result.account, { accessToken: 'token' }))[0].id).toBe('gpt-4.1')
  })
})
