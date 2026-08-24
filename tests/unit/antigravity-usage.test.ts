import { describe, expect, it } from 'vitest'
import { parseAntigravityModels, parseAntigravityQuotaSummary, parseAntigravityUsage } from '../../src/main/providers/antigravity-models'

describe('Antigravity model and usage parsing', () => {
  const payload = { models: {
    'MODEL_PLACEHOLDER_M37': { model: 'gemini-3.1-pro-high', displayName: 'Gemini 3.1 Pro (High)', quotaInfo: { remainingFraction: 0.35, resetTime: '2026-08-23T12:00:00Z' } },
    'MODEL_PLACEHOLDER_M18': { model: 'gemini-3-flash', displayName: 'Gemini 3 Flash', quotaInfo: { remainingFraction: 0.8, resetTime: '2026-08-23T13:00:00Z' } }
  } }

  it('preserves server model ids and names', () => {
    expect(parseAntigravityModels(payload).map(model => [model.id, model.name, model.runtimeId])).toEqual([
      ['gemini-3.1-pro-high', 'Gemini 3.1 Pro (High)', 'MODEL_PLACEHOLDER_M37'],
      ['gemini-3-flash', 'Gemini 3 Flash', 'MODEL_PLACEHOLDER_M18']
    ])
  })

  it('reports the most constrained remaining quota and earliest reset', () => {
    expect(parseAntigravityUsage('a1', payload, {}, 1)).toMatchObject({
      primaryUsedPercent: 65,
      resetAt: Date.parse('2026-08-23T12:00:00Z'),
      status: 'ok',
      source: 'provider',
      modelQuotas: {
        'gemini-3.1-pro-high': { remainingPercent: 35, resetAt: Date.parse('2026-08-23T12:00:00Z') },
        'gemini-3-flash': { remainingPercent: 80, resetAt: Date.parse('2026-08-23T13:00:00Z') }
      }
    })
    expect(parseAntigravityUsage('a1', payload, {}, 1).quotaGroups).toEqual([{
      id: 'gemini',
      label: 'Gemini Models',
      modelIds: ['gemini-3.1-pro-high', 'gemini-3-flash'],
      windows: [{
        id: 'gemini-session', label: 'Session', kind: 'session', remainingPercent: 35,
        resetAt: Date.parse('2026-08-23T12:00:00Z'), usageKnown: true, source: 'provider'
      }]
    }])
  })

  it('preserves Gemini and Claude/GPT grouped quota windows from quota summary', () => {
    const grouped = { response: { groups: [
      { displayName: 'Gemini Models', buckets: [
        { bucketId: 'gemini-5h', remaining: { remainingFraction: 0.7 }, resetTime: '2026-08-23T12:00:00Z', description: '5-hour' },
        { bucketId: 'gemini-weekly', remainingFraction: 0.4, resetTime: '2026-08-30T12:00:00Z', description: 'Weekly' }
      ] },
      { displayName: 'Claude and GPT models', buckets: [
        { bucketId: '3p-5h', remaining: { remainingFraction: 0.55 }, resetTime: '2026-08-23T13:00:00Z' },
        { bucketId: '3p-weekly', remaining: { remainingFraction: 0.25 }, resetTime: '2026-08-30T13:00:00Z' }
      ] }
    ] } }

    expect(parseAntigravityQuotaSummary('a1', grouped, {}, 1).quotaGroups).toEqual([
      {
        id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [
          { id: 'gemini-5h', label: '5-hour', kind: 'session', remainingPercent: 70, resetAt: Date.parse('2026-08-23T12:00:00Z'), usageKnown: true, source: 'provider' },
          { id: 'gemini-weekly', label: 'Weekly', kind: 'weekly', remainingPercent: 40, resetAt: Date.parse('2026-08-30T12:00:00Z'), usageKnown: true, source: 'provider' }
        ]
      },
      {
        id: 'claude-gpt', label: 'Claude and GPT models', modelIds: [], windows: [
          { id: '3p-5h', label: '5-hour', kind: 'session', remainingPercent: 55, resetAt: Date.parse('2026-08-23T13:00:00Z'), usageKnown: true, source: 'provider' },
          { id: '3p-weekly', label: 'Weekly', kind: 'weekly', remainingPercent: 25, resetAt: Date.parse('2026-08-30T13:00:00Z'), usageKnown: true, source: 'provider' }
        ]
      }
    ])
  })

  it('groups legacy Claude/GPT models without fabricating a weekly window', () => {
    const legacy = { models: {
      claude: { model: 'claude-sonnet-4-6', quotaInfo: { remainingFraction: 0.6, resetTime: '2026-08-23T12:00:00Z' } },
      gpt: { model: 'gpt-oss-120b-medium', quotaInfo: { remainingFraction: 0.4, resetTime: '2026-08-23T13:00:00Z' } },
      helper: { model: 'autocomplete-lite', quotaInfo: { remainingFraction: 0.01, resetTime: '2026-08-23T11:00:00Z' } }
    } }

    const groups = parseAntigravityUsage('a1', legacy, {}, 1).quotaGroups
    expect(groups).toHaveLength(1)
    expect(groups?.[0]).toMatchObject({ id: 'claude-gpt', modelIds: ['claude-sonnet-4-6', 'gpt-oss-120b-medium'] })
    expect(groups?.[0].windows).toEqual([{
      id: 'claude-gpt-session', label: 'Session', kind: 'session', remainingPercent: 40,
      resetAt: Date.parse('2026-08-23T12:00:00Z'), usageKnown: true, source: 'provider'
    }])
  })

  it('distinguishes exhausted quota from unavailable usage', () => {
    expect(parseAntigravityUsage('a1', { models: { m: { quotaInfo: { remainingFraction: 0 } } } }).unavailableReason).toBe('Quota exhausted')
    expect(parseAntigravityUsage('a1', { models: {} }).status).toBe('unavailable')
  })
})
