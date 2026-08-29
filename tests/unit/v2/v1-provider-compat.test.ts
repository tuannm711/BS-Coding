import { describe, expect, it } from 'vitest'
import { V1ProviderCompat } from '../../../src/main/v2/infrastructure/providers/v1-provider-compat'

describe('V1ProviderCompat', () => {
  it('maps account summaries without exposing secrets', async () => {
    const compat = new V1ProviderCompat({
      listProviders: async () => [{ id: 'openai', name: 'OpenAI', enabled: true, internal: 'x' }],
      listAccounts: async () => [{
        id: 'a', providerId: 'openai', enabled: true, status: 'connected', token: 'secret'
      }],
      listModels: async () => [{ id: 'm', name: 'Model', contextWindow: 1000 }],
      createRuntime: async () => ({ run: async function* () {} })
    })
    expect(await compat.listAccounts()).toEqual([{
      id: 'a', providerId: 'openai', enabled: true, status: 'HEALTHY'
    }])
    expect((await compat.listAccounts())[0]).not.toHaveProperty('token')
    expect(await compat.listProviders()).toEqual([{ id: 'openai', name: 'OpenAI', enabled: true }])
  })

  it('maps unknown legacy health conservatively', async () => {
    const compat = new V1ProviderCompat({
      listProviders: async () => [],
      listAccounts: async () => [{ id: 'a', providerId: 'p', enabled: false, status: 'mystery' }],
      listModels: async () => [], createRuntime: async () => ({ run: async function* () {} })
    })
    expect(await compat.listAccounts()).toEqual([{
      id: 'a', providerId: 'p', enabled: false, status: 'UNKNOWN'
    }])
  })
})
