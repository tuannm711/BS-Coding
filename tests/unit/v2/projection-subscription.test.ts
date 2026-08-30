import { describe, expect, it, vi } from 'vitest'
import { createProjectionPublisher } from '../../../src/main/v2/ipc/projection-publisher'
import {
  createProjectionSubscription,
  needsRefetch
} from '../../../src/renderer/src/v2/state/projection-subscription'
import type { ProjectionEvent } from '../../../src/shared/v2/contracts/ipc'

describe('projection publication and subscription sequencing', () => {
  it('publishes monotonic sequence with the supplied projection revision', () => {
    const sent: unknown[] = []
    const publisher = createProjectionPublisher({ send: event => { sent.push(event) } })

    publisher.publish(4, { status: 'RUNNING' })
    publisher.publish(5, { status: 'PAUSED' })

    expect(sent).toEqual([
      { sequence: 1, revision: 4, payload: { status: 'RUNNING' } },
      { sequence: 2, revision: 5, payload: { status: 'PAUSED' } }
    ])
  })

  it('distinguishes contiguous events from sequence gaps', () => {
    expect(needsRefetch(10, 11)).toBe(false)
    expect(needsRefetch(10, 12)).toBe(true)
  })

  it('applies contiguous events, ignores stale events and refetches once per gap', async () => {
    let listener: ((event: ProjectionEvent<{ status: string }>) => void) | undefined
    const applied: unknown[] = []
    const unsubscribe = vi.fn()
    const refetch = vi.fn(async () => ({ sequence: 20, revision: 8,
      payload: { status: 'REFETCHED' } }))
    const subscription = createProjectionSubscription<{ status: string }>({
      subscribe: callback => { listener = callback; return unsubscribe },
      refetch,
      apply: event => { applied.push(event) }
    })

    listener?.({ sequence: 1, revision: 1, payload: { status: 'RUNNING' } })
    listener?.({ sequence: 1, revision: 1, payload: { status: 'DUPLICATE' } })
    listener?.({ sequence: 3, revision: 2, payload: { status: 'GAP' } })
    listener?.({ sequence: 4, revision: 3, payload: { status: 'SAME_GAP' } })
    await subscription.whenIdle()
    listener?.({ sequence: 21, revision: 9, payload: { status: 'CONTIGUOUS' } })

    expect(refetch).toHaveBeenCalledOnce()
    expect(applied).toEqual([
      { sequence: 1, revision: 1, payload: { status: 'RUNNING' } },
      { sequence: 20, revision: 8, payload: { status: 'REFETCHED' } },
      { sequence: 21, revision: 9, payload: { status: 'CONTIGUOUS' } }
    ])
    subscription.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
