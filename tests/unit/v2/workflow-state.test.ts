import { describe, expect, it } from 'vitest'
import { transitionWorkflow, type WorkflowState } from '../../../src/main/v2/domain/workflow/workflow-state'

describe('WorkflowRun state machine', () => {
  it('follows the canonical happy path', () => {
    let run: WorkflowState = { status: 'RECEIVED', blockingGates: 0 }
    run = transitionWorkflow(run, { type: 'ANALYZE' })
    run = transitionWorkflow(run, { type: 'PLAN' })
    run = transitionWorkflow(run, { type: 'REQUEST_APPROVAL' })
    run = transitionWorkflow(run, { type: 'APPROVE' })
    run = transitionWorkflow(run, { type: 'INTEGRATE' })
    run = transitionWorkflow(run, { type: 'REVIEW' })
    run = transitionWorkflow(run, { type: 'VERIFY' })
    run = transitionWorkflow(run, { type: 'COMPLETE' })

    expect(run.status).toBe('COMPLETED')
  })

  it('cannot skip verification or complete while blocking gates remain', () => {
    expect(() => transitionWorkflow(
      { status: 'REVIEWING', blockingGates: 0 },
      { type: 'COMPLETE' }
    )).toThrow(/illegal/i)
    expect(() => transitionWorkflow(
      { status: 'VERIFYING', blockingGates: 1 },
      { type: 'COMPLETE' }
    )).toThrow(/blocking/i)
  })

  it('resumes a paused run at its prior active phase', () => {
    const paused = transitionWorkflow(
      { status: 'EXECUTING', blockingGates: 0 },
      { type: 'PAUSE' }
    )

    expect(paused).toMatchObject({ status: 'PAUSED', pausedFrom: 'EXECUTING' })
    expect(transitionWorkflow(paused, { type: 'RESUME' }).status).toBe('EXECUTING')
  })

  it('rejects transitions out of terminal states', () => {
    expect(() => transitionWorkflow(
      { status: 'COMPLETED', blockingGates: 0 },
      { type: 'PAUSE' }
    )).toThrow(/terminal/i)
  })

  it('routes failed review through rework before verification', () => {
    const rework = transitionWorkflow(
      { status: 'REVIEWING', blockingGates: 1 },
      { type: 'REQUEST_REWORK' }
    )
    expect(rework.status).toBe('REWORKING')
    expect(transitionWorkflow(
      { ...rework, blockingGates: 0 },
      { type: 'VERIFY' }
    ).status).toBe('VERIFYING')
  })
})
