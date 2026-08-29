import { describe, expect, it } from 'vitest'
import { nextAttempt, retryDecision } from '../../../src/main/v2/application/workflow/retry-policy'

describe('workflow retry policy', () => {
  it('retries only transient runtime categories', () => {
    expect(retryDecision('RATE_LIMIT')).toEqual({ retry: true, scope: 'SAME_ATTEMPT_NEW_EPOCH' })
    expect(retryDecision('NETWORK_TRANSIENT')).toEqual({ retry: true, scope: 'SAME_ATTEMPT_NEW_EPOCH' })
    expect(retryDecision('PERMISSION_DENIED')).toEqual({ retry: false })
    expect(retryDecision('INVALID_ARGS')).toEqual({ retry: false })
  })

  it('preserves attempt during runtime handoff and increments implementation retry', () => {
    const run = { id: 'tr1', taskId: 't', attempt: 2 }
    expect(nextAttempt(run, 'RUNTIME_HANDOFF')).toEqual(run)
    expect(nextAttempt(run, 'IMPLEMENTATION_RETRY')).toEqual({
      id: 'tr1-attempt-3', taskId: 't', attempt: 3, provenanceTaskRunId: 'tr1'
    })
  })
})
