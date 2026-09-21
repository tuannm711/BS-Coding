import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'
import { createGoogleAdapter } from '../../src/main/providers/adapters/google'
import { createFixtureAdapter } from '../../src/main/providers/adapters/fixture'

describe('provider adapter contract', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['openai', createOpenAiAdapter()],
    ['google', createGoogleAdapter()],
    ['antigravity', createAntigravityAdapter()],
    ['fixture', createFixtureAdapter()]
  ])('%s exposes definition, models and runtime boundaries', async (id, adapter) => {
    expect(adapter.definition().id).toBe(id)
    expect(typeof adapter.createRuntime).toBe('function')
    expect(typeof adapter.listModels).toBe('function')
  })

  it('deprecated Antigravity adapter returns unavailable capability', () => {
    const adapter = createAntigravityAdapter()
    expect(adapter.capability.status).toBe('unavailable')
  })

  it('Google adapter exposes gemini-api-key method', () => {
    const adapter = createGoogleAdapter()
    expect(adapter.capability.methods.map(m => m.id)).toContain('gemini-api-key')
  })

  it('OpenAI adapter exposes ChatGPT sign in method', () => {
    const adapter = createOpenAiAdapter()
    expect(adapter.capability.methods.map(m => m.id)).toContain('oauth')
  })
})
