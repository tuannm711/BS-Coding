import Database from 'better-sqlite3'

export function openV2Database(filePath: string): Database.Database {
  const db = new Database(filePath)
  try {
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')
    if (filePath !== ':memory:') db.pragma('journal_mode = WAL')
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
