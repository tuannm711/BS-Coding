import { describe, expect, it } from 'vitest'
import { SessionTabs } from '../../../src/browser-extension/session-tabs'

describe('session tab ownership', () => {
  it('retains all session-created tab leases while switching the default tab', () => {
    const tabs = new SessionTabs()
    tabs.bind('a', 10); tabs.bind('a', 20)
    expect(tabs.tabFor('a')).toBe(20)
    expect(tabs.ownerFor(10)).toBe('a')
    expect(() => tabs.assertOwned('a', 10)).not.toThrow()
    const restored = new SessionTabs(tabs.serialize())
    expect(restored.ownerFor(10)).toBe('a')
    expect(restored.tabFor('a')).toBe(20)
    tabs.closed(20)
    expect(tabs.tabFor('a')).toBeUndefined()
    expect(tabs.ownerFor(10)).toBe('a')
  })
  it('keeps sessions independent and rejects another session claiming the same tab', () => {
    const tabs = new SessionTabs()
    tabs.bind('a', 1); tabs.bind('b', 2)
    expect(tabs.tabFor('a')).toBe(1)
    expect(tabs.tabFor('b')).toBe(2)
    expect(() => tabs.bind('b', 1)).toThrow(/owned/i)
    expect(() => tabs.assertOwned('a', 2)).toThrow(/owned|assigned/i)
  })
  it('invalidates a closed tab without selecting any active-tab fallback', () => {
    const tabs = new SessionTabs(); tabs.bind('a', 1)
    tabs.closed(1)
    expect(tabs.tabFor('a')).toBeUndefined()
    expect(tabs.ownerFor(1)).toBeUndefined()
  })
  it('restores worker state, rejects malformed owners and serializes unique assignments', () => {
    const tabs = new SessionTabs({ a: 1, b: 2 })
    expect(tabs.tabFor('a')).toBe(1)
    expect(tabs.tabFor('b')).toBe(2)
    expect(() => tabs.bind('', 3)).toThrow()
    expect(() => tabs.bind('a', NaN)).toThrow()
  })
})
