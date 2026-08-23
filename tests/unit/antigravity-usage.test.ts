import { describe, expect, it } from 'vitest'
import { parseAntigravityModels, parseAntigravityUsage } from '../../src/main/providers/antigravity-models'

describe('Antigravity model and usage parsing', () => {
  const payload = { models: {
    'MODEL_PLACEHOLDER_M37': { model: 'gemini-3.1-pro-high', displayName: 'Gemini 3.1 Pro (High)', quotaInfo: { remainingFraction: 0.35, resetTime: '2026-08-23T12:00:00Z' } },
    'MODEL_PLACEHOLDER_M18': { model: 'gemini-3-flash', displayName: 'Gemini 3 Flash', quotaInfo: { remainingFraction: 0.8, resetTime: '2026-08-23T13:00:00Z' } }
  } }

  it('preserves server model ids and names', () => {
    expect(parseAntigravityModels(payload).map(model => [model.id, model.name])).toEqual([['gemini-3.1-pro-high', 'Gemini 3.1 Pro (High)'], ['gemini-3-flash', 'Gemini 3 Flash']])
  })

  it('reports the most constrained remaining quota and earliest reset', () => {
    expect(parseAntigravityUsage('a1', payload, {}, 1)).toMatchObject({ primaryUsedPercent: 65, resetAt: Date.parse('2026-08-23T12:00:00Z'), status: 'ok', source: 'provider' })
  })

  it('distinguishes exhausted quota from unavailable usage', () => {
    expect(parseAntigravityUsage('a1', { models: { m: { quotaInfo: { remainingFraction: 0 } } } }).unavailableReason).toBe('Quota exhausted')
    expect(parseAntigravityUsage('a1', { models: {} }).status).toBe('unavailable')
  })
})
