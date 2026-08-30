import { AsyncLocalStorage } from 'node:async_hooks'
import type BetterSqlite3 from 'better-sqlite3'

export class SqliteUnitOfWork {
  private readonly active = new AsyncLocalStorage<boolean>()
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly db: BetterSqlite3.Database) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active.getStore()) return operation()
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>(resolve => { release = resolve })
    await previous
    let began = false
    try {
      this.db.exec('BEGIN IMMEDIATE')
      began = true
      const result = await this.active.run(true, operation)
      this.db.exec('COMMIT')
      began = false
      return result
    } catch (error) {
      if (began) {
        try { this.db.exec('ROLLBACK') } catch { /* preserve the command failure */ }
      }
      throw error
    } finally {
      release()
    }
  }
}
