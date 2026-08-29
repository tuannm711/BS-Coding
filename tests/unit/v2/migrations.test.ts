import { describe, expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'

describe('V2 database migrations', () => {
  it('applies the core schema once and remains idempotent', () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      migrate(db)

      const applied = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()

      expect(applied).toEqual([{ version: 1 }, { version: 2 }])
      expect(tables).toEqual(expect.arrayContaining([
        { name: 'projects' },
        { name: 'work_sessions' },
        { name: 'workflow_runs' },
        { name: 'canonical_events' },
        { name: 'import_history' }
      ]))
    } finally {
      db.close()
    }
  })

  it('rolls back a failed migration and does not record its version', () => {
    const db = openV2Database(':memory:')
    try {
      expect(() => migrate(db, [{
        version: 99,
        sql: 'CREATE TABLE rolled_back(id TEXT PRIMARY KEY); THIS IS NOT SQL;'
      }])).toThrow()

      expect(db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rolled_back'"
      ).get()).toBeUndefined()
      expect(db.prepare('SELECT version FROM schema_migrations WHERE version = 99').get()).toBeUndefined()
    } finally {
      db.close()
    }
  })
})
