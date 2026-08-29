import { describe, expect, it } from 'vitest'
import { deriveWorkSessionStatus } from '../../../src/main/v2/domain/work-session/project-status'
import type { WorkflowRunStatus, WorkSessionStatus } from '../../../src/shared/v2/contracts/domain'

describe('WorkSession status projection', () => {
  it.each<[WorkflowRunStatus, WorkSessionStatus]>([
    ['RECEIVED', 'PLANNING'],
    ['ANALYZING', 'PLANNING'],
    ['PLANNING', 'PLANNING'],
    ['WAITING_APPROVAL', 'PLANNING'],
    ['EXECUTING', 'EXECUTING'],
    ['INTEGRATING', 'EXECUTING'],
    ['REVIEWING', 'REVIEW'],
    ['REWORKING', 'REWORK'],
    ['VERIFYING', 'VERIFYING'],
    ['PAUSED', 'PAUSED'],
    ['BLOCKED', 'BLOCKED'],
    ['FAILED', 'FAILED'],
    ['CANCELLED', 'CANCELLED'],
    ['COMPLETED', 'COMPLETED']
  ])('projects workflow %s as session %s', (workflow, session) => {
    expect(deriveWorkSessionStatus({ status: workflow })).toBe(session)
  })

  it('projects a session with no workflow as planning', () => {
    expect(deriveWorkSessionStatus(null)).toBe('PLANNING')
  })
})
