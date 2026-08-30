import type BetterSqlite3 from 'better-sqlite3'
import coreSql from './migrations/001-core.sql?raw'
import eventsSql from './migrations/002-events.sql?raw'
import projectionsSql from './migrations/003-projections-idempotency.sql?raw'

export interface Migration {
  version: number
  sql: string
}

export const defaultMigrations: readonly Migration[] = [
  { version: 1, sql: coreSql },
  { version: 2, sql: eventsSql },
  { version: 3, sql: projectionsSql }
]

export function migrate(
  db: BetterSqlite3.Database,
  migrations: readonly Migration[] = defaultMigrations
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>)
      .map(row => row.version)
  )
  const insertApplied = db.prepare(
    'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)'
  )
  const pending = [...migrations]
    .sort((left, right) => left.version - right.version)
    .filter(migration => !applied.has(migration.version))

  const applyPending = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql)
      insertApplied.run(migration.version, new Date().toISOString())
    }
  })
  applyPending()
}
