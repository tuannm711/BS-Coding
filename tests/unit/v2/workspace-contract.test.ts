import { describe, expect, it } from 'vitest'
import { taskBranch } from '../../../src/main/v2/application/ports/workspace-port'

describe('task workspace contract', () => {
  it('creates deterministic sanitized task branch names', () => {
    expect(taskBranch('wf 1', 'T/04', 2)).toBe('bs/v2/wf-1/T-04/2')
  })

  it('rejects invalid attempts and empty identities', () => {
    expect(() => taskBranch('', 'T04', 1)).toThrow(/workflow/i)
    expect(() => taskBranch('wf', 'T04', 0)).toThrow(/attempt/i)
  })
})
