import { expect, it } from 'vitest'
import { PROJECT_TABS } from '../../../src/renderer/src/v2/screens/ProjectScreen'

it('uses the locked Project tabs in the approved order', () => {
  expect(PROJECT_TABS.map(tab => tab.label)).toEqual([
    'Overview', 'Work Sessions', 'Files', 'Git', 'Agents', 'Skills', 'MCP', 'Project Settings'
  ])
})
