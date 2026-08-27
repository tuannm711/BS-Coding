import type { QueuedMessage } from './types'

// A running turn drains the queue into itself as steering. That is right for a
// person typing while they watch an agent work, and wrong for a delegated
// task: folded into unrelated work it has no turn of its own to await and no
// output of its own to report back as the assignment's result.
export function partitionSteers(queue: QueuedMessage[]): { steers: QueuedMessage[]; keep: QueuedMessage[] } {
  return {
    steers: queue.filter(message => !message.assigned),
    keep: queue.filter(message => message.assigned)
  }
}
