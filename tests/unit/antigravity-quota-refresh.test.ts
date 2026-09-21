import { describe, expect, it } from 'vitest'
import { parseAntigravityUsage } from '../../src/main/providers/antigravity-models'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'

describe('Antigravity quota parsing & deprecation', () => {
  const mixed = { models: {
    'MODEL_PLACEHOLDER_M18': { model: 'gemini-3-flash', quotaInfo: { remainingFraction: 0.8, resetTime: '2026-08-23T13:00:00Z' } },
    helper: { model: 'autocomplete-lite', quotaInfo: { remainingFraction: 0.01, resetTime: '2026-08-23T11:00:00Z' } }
  } }

  it('parses quota info from snapshot data', () => {
    const usage = parseAntigravityUsage('a1', mixed, {}, 1)
    expect(usage.primaryUsedPercent).toBe(20)
    expect(usage.status).toBe('ok')
    expect(usage.resetAt).toBe(Date.parse('2026-08-23T13:00:00Z'))
  })

  it('adapter returns unavailable status in definition', () => {
    const adapter = createAntigravityAdapter()
    expect(adapter.definition().status).toBe('unavailable')
  })
})
