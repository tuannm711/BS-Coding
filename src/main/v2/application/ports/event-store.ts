import type { CanonicalEvent } from '../../../../shared/v2/contracts/events'

export type EventToAppend = Omit<CanonicalEvent, 'sequence'>

export interface StoredEvent extends EventToAppend {
  aggregateId: string
  sequence: number
}

export interface EventStore {
  append(
    aggregateId: string,
    expectedSequence: number,
    events: readonly EventToAppend[]
  ): Promise<number>
  load(aggregateId: string, afterSequence?: number): Promise<StoredEvent[]>
}
