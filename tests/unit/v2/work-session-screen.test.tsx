import { expect, it } from 'vitest'
import {
  sessionPrimaryAction, WORK_SESSION_TABS
} from '../../../src/renderer/src/v2/screens/WorkSessionScreen'

it('uses the locked Work Session tabs and derives lifecycle action from projection status', () => {
  expect(WORK_SESSION_TABS.map(tab => tab.label))
    .toEqual(['Conversation', 'Plan', 'Tasks', 'Execution', 'Changes', 'Review'])
  expect(sessionPrimaryAction('PAUSED')).toBe('Resume')
  expect(sessionPrimaryAction('EXECUTING')).toBe('Pause')
  expect(sessionPrimaryAction('CANCELLED')).toBeNull()
})
