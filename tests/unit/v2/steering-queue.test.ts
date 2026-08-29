import { describe, expect, it } from 'vitest'
import { SteeringQueue } from '../../../src/main/v2/runtime/agent/steering-queue'

describe('SteeringQueue', () => {
  it('drains steering once in FIFO order', () => {
    const queue = new SteeringQueue<string>()
    queue.push('first'); queue.push('second')
    expect(queue.drain()).toEqual(['first', 'second'])
    expect(queue.drain()).toEqual([])
  })
})
