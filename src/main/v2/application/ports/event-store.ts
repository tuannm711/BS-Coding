export interface EventToAppend {
  schemaVersion: number
  id: string
  type: string
  occurredAt: string
  correlation: Readonly<Record<string, string | undefined>>
  payload: unknown
}

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
