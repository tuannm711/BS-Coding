import { describe, expect, it } from 'vitest'
import { success, failure } from '../../../src/shared/v2/contracts/common'
import { SystemClock } from '../../../src/main/v2/infrastructure/system/system-clock'
import { UuidGenerator } from '../../../src/main/v2/infrastructure/system/uuid-generator'

describe('command result', () => {
  it('builds serializable command success', () => {
    expect(success({ id: 'x' })).toEqual({ ok: true, value: { id: 'x' } })
  })

  it('builds serializable command failure', () => {
    expect(failure('E_BAD', 'nope')).toEqual({ ok: false, error: { code: 'E_BAD', message: 'nope' } })
  })
})

describe('system clock', () => {
  it('returns an ISO-8601 instant', () => {
    const now = new SystemClock().now()
    expect(now).toBe(new Date(now).toISOString())
  })
})

describe('uuid generator', () => {
  it('produces distinct non-empty ids', () => {
    const gen = new UuidGenerator()
    const a = gen.next()
    const b = gen.next()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })
})
