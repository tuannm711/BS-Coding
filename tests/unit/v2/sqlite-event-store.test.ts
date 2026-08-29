import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { SqliteEventStore } from '../../../src/main/v2/infrastructure/persistence/sqlite-event-store'

const occurredAt = '2026-08-29T00:00:00.000Z'

function event(id: string, type: string) {
  return {
    schemaVersion: 1,
    id,
    type,
    occurredAt,
    correlation: { projectId: 'p', workSessionId: 'w', workflowRunId: 'r' },
    payload: { id }
  }
}

describe('SqliteEventStore', () => {
  it('acquires the SQLite writer lock before checking aggregate sequence', async () => {
    const statements: string[] = []
    const db = new Database(':memory:', { verbose: sql => statements.push(String(sql)) })
    try {
      migrate(db)
      const store = new SqliteEventStore(db)
      await store.append('w', 0, [event('e1', 'USER_MESSAGE')])

      expect(statements.some(sql => /^BEGIN IMMEDIATE$/i.test(sql))).toBe(true)
    } finally {
      db.close()
    }
  })

  it('assigns monotonic aggregate sequence and loads in order', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const store = new SqliteEventStore(db)

      expect(await store.append('w', 0, [event('e1', 'USER_MESSAGE')])).toBe(1)
      expect(await store.append('w', 1, [
        event('e2', 'ASSISTANT_MESSAGE'),
        event('e3', 'WORKFLOW_LIFECYCLE')
      ])).toBe(3)

      const loaded = await store.load('w', 1)
      expect(loaded.map(item => [item.sequence, item.id])).toEqual([[2, 'e2'], [3, 'e3']])
      expect(loaded[0]).toMatchObject({
        aggregateId: 'w', schemaVersion: 1, correlation: { workflowRunId: 'r' }
      })
    } finally {
      db.close()
    }
  })

  it('rejects a stale expected sequence', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const store = new SqliteEventStore(db)
      await store.append('w', 0, [event('e1', 'USER_MESSAGE')])

      await expect(store.append('w', 0, [event('e2', 'ASSISTANT_MESSAGE')]))
        .rejects.toThrow(/sequence/i)
    } finally {
      db.close()
    }
  })

  it('rolls back the whole append batch when one event conflicts', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const store = new SqliteEventStore(db)
      await store.append('w', 0, [event('existing', 'USER_MESSAGE')])

      await expect(store.append('w', 1, [
        event('new', 'ASSISTANT_MESSAGE'),
        event('existing', 'TOOL_RESULT')
      ])).rejects.toThrow()

      expect(await store.load('w')).toHaveLength(1)
    } finally {
      db.close()
    }
  })
})
