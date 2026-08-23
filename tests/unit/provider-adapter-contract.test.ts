import { describe, expect, it } from 'vitest'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'
import { createFixtureAdapter } from '../../src/main/providers/adapters/fixture'

describe('provider adapter contract', () => {
  it.each([
    ['openai', createOpenAiAdapter()],
    ['antigravity', createAntigravityAdapter()],
    ['fixture', createFixtureAdapter()]
  ])('%s exposes definition, refresh, models and runtime boundaries', async (id, adapter) => {
    expect(adapter.definition().id).toBe(id)
    const account = { id: 'a1', providerId: id, label: id, authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }
    expect(await adapter.refreshAccount(account, {})).toEqual(account)
    expect(typeof adapter.createRuntime).toBe('function')
    expect(typeof adapter.listModels).toBe('function')
  })
})
