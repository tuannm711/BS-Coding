import type BetterSqlite3 from 'better-sqlite3'
import type {
  EventStore,
  EventToAppend,
  StoredEvent
} from '../../application/ports/event-store'

interface SequenceRow {
  sequence: number
}

interface EventRow {
  aggregate_id: string
  sequence: number
  schema_version: number
  event_id: string
  event_type: string
  occurred_at: string
  correlation_json: string
  payload_json: string
}

export class OptimisticConcurrencyError extends Error {
  constructor(aggregateId: string, expected: number, actual: number) {
    super(`event sequence conflict for ${aggregateId}: expected ${expected}, actual ${actual}`)
    this.name = 'OptimisticConcurrencyError'
  }
}

function serializeJson(value: unknown, label: string): string {
  const json = JSON.stringify(value)
  if (json === undefined) throw new TypeError(`${label} must be JSON-serializable`)
  return json
}

export class SqliteEventStore implements EventStore {
  constructor(private readonly db: BetterSqlite3.Database) {}

  async append(
    aggregateId: string,
    expectedSequence: number,
    events: readonly EventToAppend[]
  ): Promise<number> {
    if (!Number.isInteger(expectedSequence) || expectedSequence < 0) {
      throw new RangeError('expectedSequence must be a nonnegative integer')
    }

    const appendTransaction = this.db.transaction(() => {
      const current = this.db.prepare(`
        SELECT COALESCE(MAX(sequence), 0) AS sequence
        FROM canonical_events
        WHERE aggregate_id = ?
      `).get(aggregateId) as SequenceRow
      if (current.sequence !== expectedSequence) {
        throw new OptimisticConcurrencyError(aggregateId, expectedSequence, current.sequence)
      }

      const insert = this.db.prepare(`
        INSERT INTO canonical_events(
          aggregate_id, sequence, schema_version, event_id, event_type,
          occurred_at, correlation_json, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      let sequence = expectedSequence
      for (const event of events) {
        sequence += 1
        insert.run(
          aggregateId,
          sequence,
          event.schemaVersion,
          event.id,
          event.type,
          event.occurredAt,
          serializeJson(event.correlation, 'event correlation'),
          serializeJson(event.payload, 'event payload')
        )
      }
      return sequence
    })

    return appendTransaction()
  }

  async load(aggregateId: string, afterSequence = 0): Promise<StoredEvent[]> {
    if (!Number.isInteger(afterSequence) || afterSequence < 0) {
      throw new RangeError('afterSequence must be a nonnegative integer')
    }

    const rows = this.db.prepare(`
      SELECT aggregate_id, sequence, schema_version, event_id, event_type,
             occurred_at, correlation_json, payload_json
      FROM canonical_events
      WHERE aggregate_id = ? AND sequence > ?
      ORDER BY sequence ASC
    `).all(aggregateId, afterSequence) as EventRow[]

    return rows.map(row => ({
      aggregateId: row.aggregate_id,
      sequence: row.sequence,
      schemaVersion: row.schema_version,
      id: row.event_id,
      type: row.event_type,
      occurredAt: row.occurred_at,
      correlation: JSON.parse(row.correlation_json) as Record<string, string | undefined>,
      payload: JSON.parse(row.payload_json) as unknown
    }))
  }
}
