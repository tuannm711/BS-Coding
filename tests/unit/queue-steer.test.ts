import { describe, expect, it } from 'vitest'
import { partitionSteers } from '../../src/shared/queue-steer'
import type { QueuedMessage } from '../../src/shared/types'

const message = (patch: Partial<QueuedMessage> = {}): QueuedMessage =>
  ({ id: 'm1', text: 'hello', ...patch })

describe('partitionSteers', () => {
  it('lets an ordinary queued message steer the running turn', () => {
    const { steers, keep } = partitionSteers([message()])
    expect(steers).toHaveLength(1)
    expect(keep).toHaveLength(0)
  })

  it('keeps an assigned message out of the running turn', () => {
    // A delegated task folded into unrelated work has no turn of its own to
    // await and no output of its own to report.
    const { steers, keep } = partitionSteers([message({ id: 'm2', assigned: true })])
    expect(steers).toHaveLength(0)
    expect(keep.map(item => item.id)).toEqual(['m2'])
  })

  it('splits a mixed queue and preserves order within each side', () => {
    const { steers, keep } = partitionSteers([
      message({ id: 'a' }), message({ id: 'b', assigned: true }), message({ id: 'c' })
    ])
    expect(steers.map(item => item.id)).toEqual(['a', 'c'])
    expect(keep.map(item => item.id)).toEqual(['b'])
  })
})
