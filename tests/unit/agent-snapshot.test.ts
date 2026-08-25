import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SnapshotStore, MAX_SNAPSHOTS } from '../../src/main/agent/snapshot'
import type { SnapshotTurn } from '../../src/main/agent/snapshot'
import { SavedPermissions } from '../../src/main/agent/saved-permissions'
import type { SavedPermission } from '../../src/main/agent/saved-permissions'
import { writeTool } from '../../src/main/agent/tools/write'
import { editTool } from '../../src/main/agent/tools/edit'
import { revertTool } from '../../src/main/agent/tools/revert'
import type { ToolContext } from '../../src/main/agent/tools/types'

function makeStore() {
  const entries: SnapshotTurn[] = []
  return {
    store: new SnapshotStore({
      load: () => entries,
      save: (next) => entries.splice(0, entries.length, ...next)
    }),
    entries
  }
}

describe('SnapshotStore', () => {
  it('persists project, session, turn, and Agent ownership for shared-session undo', () => {
    const entries: SnapshotTurn[] = []
    const store = new SnapshotStore({
      load: () => entries,
      save: next => entries.splice(0, entries.length, ...next)
    })

    store.beginTurn('session-1', {
      projectPath: 'C:/project',
      sessionId: 'session-1',
      turnId: 'turn-b',
      agentId: 'agent-b'
    })
    store.snapshot('session-1', '/x/f.ts', 'before')
    store.commitTurn('session-1')

    expect(entries[0]).toMatchObject({
      projectPath: 'C:/project',
      sessionId: 'session-1',
      turnId: 'turn-b',
      agentId: 'agent-b'
    })
    expect(store.undo('session-1')).toMatchObject({ turnId: 'turn-b', agentId: 'agent-b' })
  })

  it('records one turn per commit and restores on undo', () => {
    const { store, entries } = makeStore()
    store.beginTurn('a1')
    store.snapshot('a1', '/x/f.ts', 'original')
    store.snapshot('a1', '/x/f.ts', 'overwritten')
    store.commitTurn('a1')
    expect(entries).toHaveLength(1)
    expect(entries[0].before).toEqual({ '/x/f.ts': 'original' })
    expect(store.undo('a1')).not.toBeNull()
    expect(entries).toHaveLength(0)
    expect(store.undo('a1')).toBeNull()
  })

  it('keeps only the first snapshot per file within a turn', () => {
    const { store, entries } = makeStore()
    store.beginTurn('a1')
    store.snapshot('a1', '/x/f.ts', 'first')
    store.snapshot('a1', '/x/f.ts', 'second')
    store.commitTurn('a1')
    expect(entries[0].before['/x/f.ts']).toBe('first')
  })

  it('keeps separate agents isolated and caps history', () => {
    const { store, entries } = makeStore()
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) {
      store.beginTurn('a1')
      store.snapshot('a1', `/x/${i}.ts`, String(i))
      store.commitTurn('a1')
    }
    store.beginTurn('a2')
    store.snapshot('a2', '/y/g.ts', 'other')
    store.commitTurn('a2')
    expect(entries.filter(e => e.agentId === 'a1')).toHaveLength(MAX_SNAPSHOTS)
    expect(entries.filter(e => e.agentId === 'a2')).toHaveLength(1)
    store.clear('a2')
    expect(entries.every(e => e.agentId !== 'a2')).toBe(true)
  })

  it('originals returns the earliest recorded content per file', () => {
    const { store } = makeStore()
    store.beginTurn('a1')
    store.snapshot('a1', '/x/f.ts', 'v1')
    store.commitTurn('a1')
    store.beginTurn('a1')
    store.snapshot('a1', '/x/f.ts', 'v2')
    store.commitTurn('a1')
    expect(store.originals('a1')).toEqual([{ filePath: '/x/f.ts', content: 'v1' }])
  })
})

describe('SavedPermissions', () => {
  it('saves and checks always-allow rules per project', () => {
    const entries: SavedPermission[] = []
    const store = new SavedPermissions({
      load: () => entries,
      save: (next) => entries.splice(0, entries.length, ...next)
    })
    expect(store.isAllowed('/proj/a', 'bash')).toBe(false)
    store.save('/proj/a', 'bash')
    expect(store.isAllowed('/proj/a', 'bash')).toBe(true)
    expect(store.isAllowed('/proj/b', 'bash')).toBe(false)
  })
})

describe('revert tool + file tools snapshot', () => {
  let dir: string
  let ctx: ToolContext
  let store: SnapshotStore

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'bs-snap-'))
    store = makeStore().store
    ctx = { cwd: dir, ask: async () => null, agentId: 'a1', snapshots: store }
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  async function inTurn(fn: () => Promise<unknown>): Promise<void> {
    store.beginTurn('a1')
    try {
      await fn()
    } finally {
      store.commitTurn('a1')
    }
  }

  it('reverts a write back to the original content', async () => {
    writeFileSync(path.join(dir, 'f.txt'), 'original')
    await inTurn(() => writeTool.run({ file_path: 'f.txt', content: 'changed' }, ctx))
    expect(readFileSync(path.join(dir, 'f.txt'), 'utf-8')).toBe('changed')
    const r = await revertTool.run({}, ctx)
    expect(r.output).toContain('reverted 1')
    expect(readFileSync(path.join(dir, 'f.txt'), 'utf-8')).toBe('original')
  })

  it('reverts an edit back to the original content', async () => {
    writeFileSync(path.join(dir, 'f.txt'), 'aaa\nbbb\n')
    await inTurn(() => editTool.run({ file_path: 'f.txt', old_string: 'bbb', new_string: 'BBB' }, ctx))
    expect(readFileSync(path.join(dir, 'f.txt'), 'utf-8')).toBe('aaa\nBBB\n')
    await revertTool.run({}, ctx)
    expect(readFileSync(path.join(dir, 'f.txt'), 'utf-8')).toBe('aaa\nbbb\n')
  })

  it('reports when there is nothing to revert', async () => {
    const r = await revertTool.run({}, ctx)
    expect(r.output).toContain('no changes')
  })
})

describe('call-granular undo', () => {
  function setup() {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-snap-call-'))
    const a = path.join(dir, 'a.txt')
    const b = path.join(dir, 'b.txt')
    const c = path.join(dir, 'c.txt')
    for (const [file, text] of [[a, 'A0'], [b, 'B0'], [c, 'C0']] as const) writeFileSync(file, text)
    const { store } = makeStore()
    store.beginTurn('s1', { sessionId: 's1', turnId: 't1', agentId: 'ag1' })
    store.snapshot('s1', a, 'A0', 'call-1')
    store.snapshot('s1', b, 'B0', 'call-1')
    store.snapshot('s1', c, 'C0', 'call-2')
    for (const [file, text] of [[a, 'A1'], [b, 'B1'], [c, 'C1']] as const) writeFileSync(file, text)
    store.commitTurn('s1')
    return { store, a, b, c }
  }

  it('restores only the files one call touched', () => {
    const { store, a, b, c } = setup()
    expect(store.undoCall('s1', 'call-1')).not.toBeNull()
    expect(readFileSync(a, 'utf-8')).toBe('A0')
    expect(readFileSync(b, 'utf-8')).toBe('B0')
    expect(readFileSync(c, 'utf-8')).toBe('C1')
  })

  it('still undoes the whole turn after one call has been undone', () => {
    const { store, c } = setup()
    store.undoCall('s1', 'call-1')
    expect(store.undo('s1')).not.toBeNull()
    expect(readFileSync(c, 'utf-8')).toBe('C0')
  })

  it('reports nothing for a call it never recorded', () => {
    const { store } = setup()
    expect(store.undoCall('s1', 'call-missing')).toBeNull()
  })

  it('keeps call ids across a load, which strips any field normalize forgets', () => {
    const { store } = setup()
    expect(store.undoCall('s1', 'call-2')).not.toBeNull()
  })

  it('undoes at turn level for a snapshot stored without call ids', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-snap-legacy-'))
    const file = path.join(dir, 'legacy.txt')
    writeFileSync(file, 'L0')
    const { store } = makeStore()
    store.beginTurn('s2', { sessionId: 's2', turnId: 't1', agentId: 'ag1' })
    store.snapshot('s2', file, 'L0')
    writeFileSync(file, 'L1')
    store.commitTurn('s2')
    expect(store.undoCall('s2', 'any')).toBeNull()
    expect(store.undo('s2')).not.toBeNull()
    expect(readFileSync(file, 'utf-8')).toBe('L0')
  })
})
