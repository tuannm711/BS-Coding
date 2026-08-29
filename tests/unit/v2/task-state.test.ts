import { describe, expect, it } from 'vitest'
import { transitionTask } from '../../../src/main/v2/domain/task/task-state'

describe('TaskRun state machine', () => {
  it('follows the canonical execution path', () => {
    const ready = transitionTask({ status: 'QUEUED' }, { type: 'MARK_READY' })
    const running = transitionTask(ready, { type: 'START' })
    const completed = transitionTask(running, { type: 'COMPLETE' })

    expect(completed.status).toBe('COMPLETED')
  })

  it('cannot complete before running', () => {
    expect(() => transitionTask(
      { status: 'READY' },
      { type: 'COMPLETE' }
    )).toThrow(/illegal/i)
  })

  it('returns from approval wait to the same run', () => {
    const waiting = transitionTask({ status: 'RUNNING' }, { type: 'WAIT_APPROVAL' })
    expect(waiting.status).toBe('WAITING_APPROVAL')
    expect(transitionTask(waiting, { type: 'APPROVE' }).status).toBe('RUNNING')
  })

  it('routes review failure to explicit rework', () => {
    const failed = transitionTask({ status: 'RUNNING' }, { type: 'REVIEW_FAIL' })
    expect(failed.status).toBe('REVIEW_FAILED')
    expect(transitionTask(failed, { type: 'START_REWORK' }).status).toBe('REWORK')
  })

  it('rejects transitions out of terminal states', () => {
    expect(() => transitionTask(
      { status: 'CANCELLED' },
      { type: 'START' }
    )).toThrow(/terminal/i)
  })
})
