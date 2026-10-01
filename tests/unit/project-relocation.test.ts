import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { SessionStore, type StoredSession } from '../../src/main/agent/session'
import { SnapshotStore, type SnapshotTurn } from '../../src/main/agent/snapshot'
import { createJsonStore } from '../../src/main/json-store'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

describe('project relocation', () => {
  it('moves persisted history and undo targets while leaving unrelated history and files alone', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-move-'))
    const previous = path.join(dir, 'old')
    const next = path.join(dir, 'next')
    const external = path.join(dir, 'external.txt')
    writeFileSync(external, 'external')
    try {
      const sessionFile = path.join(dir, 'sessions.json')
      const sessions = new SessionStore(createJsonStore<StoredSession>(sessionFile))
      const mine = sessions.createProject(previous, 'a1')
      const other = sessions.createProject(path.join(dir, 'other'), 'b1')
      sessions.appendMessage(mine.id, { id: 'msg', role: 'assistant', text: 'Keep markdown **and tools**', createdAt: 1 })
      const snapshots = new SnapshotStore(createJsonStore<SnapshotTurn>(path.join(dir, 'snapshots.json')))
      snapshots.pushTurn({ agentId: 'a1', sessionId: mine.id, projectPath: previous, turnId: 't1', ts: 1,
        before: { [path.join(previous, 'src', 'file.ts')]: 'before', [external]: 'external' },
        after: { [path.join(previous, 'src', 'file.ts')]: 'after' },
        calls: { edit: { [path.join(previous, 'src', 'file.ts')]: 'before' } } })
      const restoreSessions = sessions.relocateProject(previous, next)
      const restoreSnapshots = snapshots.relocateProject(previous, next, new Set([mine.id]))
      expect(new SessionStore(createJsonStore<StoredSession>(sessionFile)).listProject(next)[0].id).toBe(mine.id)
      expect(sessions.listProject(path.join(dir, 'other'))[0].id).toBe(other.id)
      const saved = JSON.parse(readFileSync(path.join(dir, 'snapshots.json'), 'utf8'))[0]
      expect(saved.before).toEqual({ [path.join(next, 'src', 'file.ts')]: 'before', [external]: 'external' })
      expect(saved.calls.edit).toEqual({ [path.join(next, 'src', 'file.ts')]: 'before' })
      expect(readFileSync(external, 'utf8')).toBe('external')
      restoreSnapshots()
      restoreSessions()
      expect(sessions.listProject(previous)[0].id).toBe(mine.id)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('keeps the session cache at the original folder when persistence fails', () => {
    let data: StoredSession[] = []
    let fail = false
    const store = new SessionStore({ load: () => data, save: next => { if (fail) throw new Error('disk denied'); data = next } })
    const session = store.createProject('/old', 'a1')
    fail = true
    expect(() => store.relocateProject('/old', '/next')).toThrow('disk denied')
    expect(store.listProject('/old')[0].id).toBe(session.id)
    expect(store.listProject('/next')).toEqual([])
  })
})
