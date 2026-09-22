import { describe, it, expect } from 'vitest'
import { createOpenAiCompatibleAdapter } from '../../src/main/providers/adapters/openai-compatible'

function makeContext() {
  let saved: { account: Record<string, unknown>; secret: Record<string, unknown> } | undefined
  const context = {
    saveAccount: (account: Record<string, unknown>, secret?: Record<string, unknown>) => {
      saved = { account, secret: secret ?? {} }
      return { ...account, id: 'acc', createdAt: 1, lastUsedAt: 1 }
    }
  }
  return { context, saved: () => saved }
}

describe('DeepSeek provider', () => {
  it('exposes an api-key connection method', () => {
    const adapter = createOpenAiCompatibleAdapter('deepseek', 'DeepSeek', true)
    expect(adapter.capability.id).toBe('deepseek')
    expect(adapter.capability.methods.some(m => m.id === 'api-key')).toBe(true)
  })

  it('defaults the base URL to DeepSeek when the user enters none', async () => {
    const adapter = createOpenAiCompatibleAdapter('deepseek', 'DeepSeek', true)
    const c = makeContext()
    await adapter.connect(
      { providerId: 'deepseek', methodId: 'api-key', fields: { apiKey: 'sk-x' } } as never,
      c.context as never
    )
    expect(String(c.saved()?.secret.baseUrl)).toContain('deepseek.com')
  })
})

describe('Custom API provider', () => {
  it('requires a base URL from the user (no default)', async () => {
    const adapter = createOpenAiCompatibleAdapter('custom', 'Custom API', true)
    const c = makeContext()
    await expect(
      adapter.connect(
        { providerId: 'custom', methodId: 'api-key', fields: { apiKey: 'sk-x' } } as never,
        c.context as never
      )
    ).rejects.toThrow('baseUrl')
  })

  it('connects with a user-provided base URL and name', async () => {
    const adapter = createOpenAiCompatibleAdapter('custom', 'Custom API', true)
    const c = makeContext()
    await adapter.connect(
      { providerId: 'custom', methodId: 'api-key', fields: { apiKey: 'sk-x', baseUrl: 'https://my.api/v1', label: 'My LLM' } } as never,
      c.context as never
    )
    expect(c.saved()?.account.label).toBe('My LLM')
    expect(c.saved()?.secret.baseUrl).toBe('https://my.api/v1')
  })
})
