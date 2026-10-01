import { describe, expect, it } from 'vitest'
import { appendStreamDelta } from '../../src/shared/text'

describe('appendStreamDelta', () => {
  it('appends disjoint deltas unchanged', () => {
    let buf = appendStreamDelta('', 'Tất')
    buf = appendStreamDelta(buf, ' nhiên')
    buf = appendStreamDelta(buf, '!!')
    expect(buf).toBe('Tất nhiên!!')
  })

  it('preserves an overlapping suffix as new incremental text', () => {
    expect(appendStreamDelta('book', 'keeper')).toBe('bookkeeper')
    expect(appendStreamDelta('*', '*bold**')).toBe('**bold**')
  })

  it('preserves identical consecutive deltas', () => {
    let buf = appendStreamDelta('', 'hello')
    buf = appendStreamDelta(buf, 'hello')
    expect(buf).toBe('hellohello')
  })

  it('handles empty buffer and empty delta', () => {
    expect(appendStreamDelta('', 'x')).toBe('x')
    expect(appendStreamDelta('abc', '')).toBe('abc')
  })
})
