import { describe, expect, it } from 'vitest'
import { contextTokens, contextPercent, contextLevel, latestContextTokens } from '../../src/shared/usage'
import type { ChatTranscriptItem } from '../../src/shared/types'

describe('contextTokens', () => {
  it('uses total when the provider reports it', () => {
    expect(contextTokens({ input: 100, output: 20, total: 130 })).toBe(130)
  })

  it('falls back to input + output when total is missing', () => {
    expect(contextTokens({ input: 100, output: 20, total: 0 })).toBe(120)
  })

  it('counts each cached prompt token once when the provider omits total', () => {
    expect(contextTokens({ input: 60, output: 20, total: 0, cacheRead: 30, cacheWrite: 10, reasoning: 5 })).toBe(120)
  })

  it('ignores the breakdown fields in the sum', () => {
    // reasoning/cacheRead được lưu để sau này chỉnh công thức, không cộng thêm ở đây
    expect(contextTokens({ input: 100, output: 20, total: 130, reasoning: 8, cacheRead: 500 })).toBe(130)
  })
})

describe('latestContextTokens', () => {
  const assistant = (tokens?: { input: number; output: number; total: number }): ChatTranscriptItem => ({
    kind: 'message', message: { id: 'assistant', role: 'assistant', text: '', createdAt: 1, tokens }
  })

  it('restores reported context from an input-only assistant response', () => {
    expect(latestContextTokens([assistant({ input: 100, output: 0, total: 100 })])).toBe(100)
  })

  it('does not reuse an older request measurement when the newest user request has no measured response', () => {
    expect(latestContextTokens([assistant({ input: 100, output: 20, total: 120 }), { kind: 'message', message: { id: 'latest-user', role: 'user', text: 'new request', createdAt: 2 } }])).toBeNull()
  })

  it('keeps the latest response unknown instead of reusing earlier measured context', () => {
    expect(latestContextTokens([assistant({ input: 100, output: 20, total: 120 }), assistant()])).toBeNull()
  })

  it('restores the selected session independently of another session', () => {
    const first = [assistant({ input: 100, output: 20, total: 120 })]
    const second = [assistant({ input: 200, output: 30, total: 230 })]
    expect(latestContextTokens(first)).toBe(120)
    expect(latestContextTokens(second)).toBe(230)
    expect(latestContextTokens([])).toBeNull()
  })
})

describe('contextPercent', () => {
  it('rounds the ratio against the limit', () => {
    expect(contextPercent(45231, 200000)).toBe(23)
  })

  it('returns null without a usable limit', () => {
    expect(contextPercent(1000, null)).toBeNull()
    expect(contextPercent(1000, 0)).toBeNull()
  })
})

describe('contextLevel', () => {
  const threshold = 180000

  it('is normal below 80% of the compact threshold', () => {
    expect(contextLevel(100000, threshold)).toBe('normal')
  })

  it('warns from 80% of the compact threshold', () => {
    expect(contextLevel(144000, threshold)).toBe('warn')
    expect(contextLevel(179999, threshold)).toBe('warn')
  })

  it('is danger at or above the compact threshold', () => {
    expect(contextLevel(180000, threshold)).toBe('danger')
    expect(contextLevel(195000, threshold)).toBe('danger')
  })

  it('stays normal when auto-compaction is off', () => {
    expect(contextLevel(999999, null)).toBe('normal')
    expect(contextLevel(999999, 0)).toBe('normal')
  })
})
