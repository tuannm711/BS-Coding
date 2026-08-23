import { describe, expect, it } from 'vitest'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'

describe('Antigravity model catalog', () => {
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
