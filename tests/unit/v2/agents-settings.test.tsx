import { expect, it } from 'vitest'
import { GLOBAL_SETTINGS } from '../../../src/renderer/src/v2/screens/SettingsScreen'

it('keeps project Agent management out of global settings', () => {
  expect(GLOBAL_SETTINGS).not.toContain('Agents')
  expect(GLOBAL_SETTINGS).toContain('Providers')
  expect(GLOBAL_SETTINGS).toEqual([
    'Application', 'Appearance', 'Providers', 'Security',
    'Default Permissions', 'Updates', 'Remote Control'
  ])
})
