import { describe, expect, it } from 'vitest'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createFixtureAdapter } from '../../src/main/providers/adapters/fixture'

describe('ProviderRegistry', () => {
  it('lists only ready adapter capabilities and resolves methods', () => {
    const registry = new ProviderRegistry()
    registry.register(createFixtureAdapter())
    expect(registry.listReady().map(item => item.id)).toEqual(['fixture'])
    expect(registry.methods('fixture').map(item => item.id)).toEqual(['api-key', 'imported'])
    expect(registry.get('missing')).toBeUndefined()
  })

  it('rejects duplicate provider ids', () => {
    const registry = new ProviderRegistry()
    registry.register(createFixtureAdapter())
    expect(() => registry.register(createFixtureAdapter())).toThrow('already registered')
  })
})
