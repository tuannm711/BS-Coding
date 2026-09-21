import { describe, expect, it } from 'vitest'
import { createGoogleAdapter } from '../../src/main/providers/adapters/google'

describe('Google / Gemini Provider Adapter', () => {
  const adapter = createGoogleAdapter()

  it('exposes definition with gemini-api-key and vertex-ai methods', () => {
    const def = adapter.definition()
    expect(def.id).toBe('google')
    expect(def.displayName).toBe('Google / Gemini')
    expect(def.methods).toHaveLength(2)

    const apiKeyMethod = def.methods.find(m => m.id === 'gemini-api-key')
    expect(apiKeyMethod).toBeDefined()
    expect(apiKeyMethod?.kind).toBe('api-key')
    expect(apiKeyMethod?.fields).toContain('apiKey')

    const vertexMethod = def.methods.find(m => m.id === 'vertex-ai')
    expect(vertexMethod).toBeDefined()
    expect(vertexMethod?.kind).toBe('api-key')
    expect(vertexMethod?.fields).toContain('projectId')
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

  it('connects with Vertex AI parameters', async () => {
    const savedAccounts: any[] = []
    const context = {
      saveAccount: (account: any, secrets: any) => {
        const item = { id: 'acc_2', ...account }
        savedAccounts.push({ item, secrets })
        return item
      }
    }

    const res = await adapter.connect({
      providerId: 'google',
      methodId: 'vertex-ai',
      fields: { apiKey: 'AIzaSyTest123', projectId: 'my-gcp-project', location: 'us-central1' }
    }, context)

    expect(res.account).toBeDefined()
    expect(res.account.providerId).toBe('google')
    expect(res.account.authMode).toBe('api-key')
    expect(savedAccounts[0].secrets.projectId).toBe('my-gcp-project')
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
