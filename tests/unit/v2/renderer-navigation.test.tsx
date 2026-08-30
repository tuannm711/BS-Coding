import { expect, it } from 'vitest'
import { rendererMode, V2_NAV_ITEMS } from '../../../src/renderer/src/v2/app/navigation'

it('has exactly five production navigation items and excludes the state catalogue', () => {
  expect(V2_NAV_ITEMS.map(item => item.label))
    .toEqual(['Home', 'Projects', 'Work', 'Agents', 'Settings'])
  expect(V2_NAV_ITEMS.map(item => item.label)).not.toContain('States')
})

it('selects the V2 shell only when the immutable bootstrap flag is enabled', () => {
  expect(rendererMode(true)).toBe('v2')
  expect(rendererMode(false)).toBe('v1')
})
