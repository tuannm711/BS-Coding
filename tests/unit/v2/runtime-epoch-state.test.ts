import { describe, expect, it } from 'vitest'
import { transitionRuntimeEpoch } from '../../../src/main/v2/domain/runtime/runtime-epoch-state'

describe('RuntimeEpoch state machine', () => {
  it('follows STARTING to CLOSED lifecycle', () => {
    const active = transitionRuntimeEpoch({ status: 'STARTING' }, { type: 'ACTIVATE' })
    const closing = transitionRuntimeEpoch(active, { type: 'BEGIN_CLOSE' })
    const closed = transitionRuntimeEpoch(closing, { type: 'FINISH_CLOSE' })

    expect(closed.status).toBe('CLOSED')
  })

  it('routes interruption through CLOSING', () => {
    expect(transitionRuntimeEpoch(
      { status: 'ACTIVE' },
      { type: 'INTERRUPT' }
    ).status).toBe('CLOSING')
  })

  it('cannot skip CLOSING', () => {
    expect(() => transitionRuntimeEpoch(
      { status: 'ACTIVE' },
      { type: 'FINISH_CLOSE' }
    )).toThrow(/illegal/i)
  })

  it('never resumes a closed epoch', () => {
    expect(() => transitionRuntimeEpoch(
      { status: 'CLOSED' },
      { type: 'ACTIVATE' }
    )).toThrow(/terminal/i)
  })
})
