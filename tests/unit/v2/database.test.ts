import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('V2 database bootstrap', () => {
  it('enables foreign keys and a busy timeout', () => {
    const db = openV2Database(':memory:')
    try {
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000)
      expect(db.pragma('journal_mode', { simple: true })).toBe('memory')
    } finally {
      db.close()
    }
  })

  it('uses WAL for a file-backed database', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-v2-db-'))
    tempDirs.push(dir)
    const db = openV2Database(path.join(dir, 'state.sqlite'))
    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    } finally {
      db.close()
    }
  })
})
