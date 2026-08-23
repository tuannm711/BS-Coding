import { describe, expect, it } from 'vitest'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { antigravityQuotaGroupForModel, canonicalAntigravityModelId, parseAntigravityModels } from '../../src/main/providers/antigravity-models'

describe('Antigravity model catalog', () => {
  it('classifies code models into provider-native quota families', () => {
    expect(antigravityQuotaGroupForModel('gemini-3.1-pro-high')).toBe('gemini')
    expect(antigravityQuotaGroupForModel('claude-sonnet-4-6')).toBe('claude-gpt')
    expect(antigravityQuotaGroupForModel('gpt-oss-120b-medium')).toBe('claude-gpt')
    expect(antigravityQuotaGroupForModel('autocomplete-lite')).toBeUndefined()
    expect(antigravityQuotaGroupForModel('gemini-image')).toBeUndefined()
  })

  it('resolves Cockpit aliases to stable persisted ids and keeps the transport constant', () => {
    expect(canonicalAntigravityModelId('MODEL_PLACEHOLDER_M8')).toBe('gemini-3.1-pro-high')
    expect(canonicalAntigravityModelId('gemini-3-pro-high')).toBe('gemini-3.1-pro-high')
    expect(canonicalAntigravityModelId('claude-sonnet-4-5-thinking')).toBe('claude-sonnet-4-6')

    expect(parseAntigravityModels({ models: {
      'gemini-3-pro-high': { model: 'MODEL_PLACEHOLDER_M37', displayName: 'Gemini 3.1 Pro (High)' }
    } })).toEqual([expect.objectContaining({
      id: 'gemini-3.1-pro-high',
      runtimeId: 'MODEL_PLACEHOLDER_M37',
      name: 'Gemini 3.1 Pro (High)'
    })])
  })

  it('exposes the current code models supported by the Pro account runtime', async () => {
    const models = await createAntigravityAdapter().listModels({} as never, {})
    expect(models.map(model => model.id)).toEqual([
      'gemini-3.1-pro-high',
      'gemini-3.1-pro-low',
      'gemini-3-flash',
      'claude-sonnet-4-6',
      'claude-opus-4-6-thinking',
      'gpt-oss-120b-medium'
    ])
  })
})
