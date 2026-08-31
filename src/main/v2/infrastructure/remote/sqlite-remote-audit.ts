import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import type { RemoteAuditEvent } from '../../../../shared/v2/contracts/remote'
import { RemoteAuditEventSchema } from '../../../../shared/v2/schemas/remote'

export interface RemoteAuditStore {
  record(event: RemoteAuditEvent): Promise<void>
  list(limit: number): Promise<RemoteAuditEvent[]>
}

export function createRemoteAuditStore(
  db: BetterSqlite3.Database,
  nextId: () => string = randomUUID
): RemoteAuditStore {
  return {
    async record(input) {
      const event = RemoteAuditEventSchema.parse(input) as RemoteAuditEvent
      db.prepare(`INSERT INTO remote_audit_events(id, occurred_at, event_type, payload_json)
        VALUES (?, ?, ?, ?)`).run(nextId(), event.timestamp, event.type, JSON.stringify(event))
    },
    async list(limit) {
      if (!Number.isInteger(limit) || limit <= 0) throw new RangeError('limit must be a positive integer')
      const rows = db.prepare(`SELECT payload_json FROM remote_audit_events
        ORDER BY occurred_at ASC, id ASC LIMIT ?`).all(limit) as Array<{ payload_json: string }>
      return rows.map(row => RemoteAuditEventSchema.parse(JSON.parse(row.payload_json)) as RemoteAuditEvent)
    }
  }
}
