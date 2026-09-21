import { describe, expect, it } from 'vitest'
import { createGoogleAdapter } from '../../src/main/providers/adapters/google'

describe('Google / Gemini Provider Adapter', () => {
  const adapter = createGoogleAdapter()

  it('exposes definition with gemini-api-key method only', () => {
    const def = adapter.definition()
    expect(def.id).toBe('google')
    expect(def.displayName).toBe('Google / Gemini')
    expect(def.methods).toHaveLength(1)

    const apiKeyMethod = def.methods.find(m => m.id === 'gemini-api-key')
    expect(apiKeyMethod).toBeDefined()
    expect(apiKeyMethod?.kind).toBe('api-key')
    expect(apiKeyMethod?.fields).toContain('apiKey')

    const vertexMethod = def.methods.find(m => m.id === 'vertex-ai')
    expect(vertexMethod).toBeUndefined()
  })

  it('connects with Gemini API Key successfully', async () => {
    const savedAccounts: any[] = []
    const context = {
      saveAccount: (account: any, secrets: any) => {
        const item = { id: 'acc_1', ...account }
        savedAccounts.push({ item, secrets })
        return item
      }
    }

    const res = await adapter.connect({
      providerId: 'google',
      methodId: 'gemini-api-key',
      fields: { apiKey: 'AIzaSyTest1234567890' }
    }, context)

    expect(res.account).toBeDefined()
    expect(res.account.providerId).toBe('google')
    expect(res.account.authMode).toBe('api-key')
    expect(res.account.status).toBe('active')
    expect(savedAccounts[0].secrets.apiKey).toBe('AIzaSyTest1234567890')
  })

  it('rejects unsupported methods like vertex-ai', async () => {
    const context = { saveAccount: () => ({} as any) }
    await expect(adapter.connect({
      providerId: 'google',
      methodId: 'vertex-ai',
      fields: { apiKey: 'AIzaSyTest123' }
    }, context)).rejects.toThrow('Phương thức kết nối không hỗ trợ: vertex-ai')
  })

  it('rejects empty API key', async () => {
    const context = { saveAccount: () => ({} as any) }
    await expect(adapter.connect({
      providerId: 'google',
      methodId: 'gemini-api-key',
      fields: { apiKey: '' }
    }, context)).rejects.toThrow('[bs] Gemini API key không được để trống')
  })

  it('lists Gemini models', async () => {
    const models = await adapter.listModels({} as any, {} as any)
    expect(models.map(m => m.id)).toContain('gemini-2.5-pro')
    expect(models.map(m => m.id)).toContain('gemini-2.5-flash')
  })
})
