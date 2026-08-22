import { describe, expect, it } from 'vitest'
import { migrateBrandStorage } from '../../src/renderer/src/brand-storage'

describe('migrateBrandStorage', () => {
  it('copies known legacy preferences to BS keys and removes the legacy keys', () => {
    const storage = new Map<string, string>([
      ['meow.rightpanel.open', '1'],
      ['meow.rightpanel.tab', 'artifacts'],
      ['meow.rightpanel.width', '320'],
      ['meow.sidebar.collapsed', '0']
    ])
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
    migrateBrandStorage(localStorage)
    expect(storage.get('bs.rightpanel.open')).toBe('1')
    expect(storage.get('bs.rightpanel.tab')).toBe('artifacts')
    expect(storage.get('bs.rightpanel.width')).toBe('320')
    expect(storage.get('bs.sidebar.collapsed')).toBe('0')
    expect([...storage.keys()].some(key => key.startsWith('meow.'))).toBe(false)
  })

  it('never overwrites a BS preference and is idempotent', () => {
    const storage = new Map<string, string>([
      ['meow.rightpanel.open', '0'],
      ['bs.rightpanel.open', '1']
    ])
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
    migrateBrandStorage(localStorage)
    migrateBrandStorage(localStorage)
    expect(storage.get('bs.rightpanel.open')).toBe('1')
    expect(storage.has('meow.rightpanel.open')).toBe(false)
  })
})
