import { readFileSync, writeFileSync } from 'node:fs'
import type { JsonStore } from '../json-store'

export interface SnapshotFile {
  filePath: string
  content: string
}

export interface SnapshotTurn {
  agentId: string
  projectPath?: string
  sessionId?: string
  turnId?: string
  ts: number
  before: Record<string, string>
  after: Record<string, string>
  // Which tool call touched which files, so one call can be undone without the
  // rest of its turn. Absent on anything written before this existed, which
  // still undoes at turn level.
  calls?: Record<string, Record<string, string>>
}

export const MAX_SNAPSHOTS = 50

type RawEntry = Partial<SnapshotTurn> & { filePath?: string; content?: string }

function normalize(raw: RawEntry): SnapshotTurn {
  if (raw.before) {
    return {
      agentId: raw.agentId ?? '',
      projectPath: raw.projectPath,
      sessionId: raw.sessionId,
      turnId: raw.turnId,
      ts: raw.ts ?? 0,
      before: raw.before,
      after: raw.after ?? {},
      ...(raw.calls ? { calls: raw.calls } : {})
    }
  }
  // Legacy per-file entry {agentId, filePath, content} → single-file turn.
  return {
    agentId: raw.agentId ?? '',
    ts: 0,
    before: raw.filePath && raw.content !== undefined ? { [raw.filePath]: raw.content } : {},
    after: {}
  }
}

export class SnapshotStore {
  private buffer = new Map<string, {
    files: Map<string, string>
    calls: Map<string, Set<string>>
    metadata?: Pick<SnapshotTurn, 'projectPath' | 'sessionId' | 'turnId' | 'agentId'>
  }>()

  constructor(private store: JsonStore<SnapshotTurn>) {}

  private loadTurns(): SnapshotTurn[] {
    return (this.store.load() as unknown as RawEntry[]).map(normalize)
  }

  private saveTurns(turns: SnapshotTurn[]): void {
    this.store.save(turns)
  }

  private turnsFor(agentId: string): SnapshotTurn[] {
    return this.loadTurns().filter(t => (t.sessionId ?? t.agentId) === agentId)
  }

  beginTurn(
    scopeId: string,
    metadata?: Pick<SnapshotTurn, 'projectPath' | 'sessionId' | 'turnId' | 'agentId'>
  ): void {
    if (!this.buffer.has(scopeId)) this.buffer.set(scopeId, { files: new Map(), calls: new Map(), metadata })
  }

  abortTurn(agentId: string): void {
    this.buffer.delete(agentId)
  }

  // Records the pre-change content of a file for the current in-progress turn.
  snapshot(agentId: string, filePath: string, content: string, callId?: string): void {
    const buf = this.buffer.get(agentId)
    if (!buf) return
    if (!buf.files.has(filePath)) buf.files.set(filePath, content)
    if (!callId) return
    const forCall = buf.calls.get(callId) ?? new Set<string>()
    forCall.add(filePath)
    buf.calls.set(callId, forCall)
  }

  commitTurn(agentId: string): void {
    const buf = this.buffer.get(agentId)
    this.buffer.delete(agentId)
    if (!buf || buf.files.size === 0) return
    const before: Record<string, string> = {}
    const after: Record<string, string> = {}
    for (const [filePath, content] of buf.files) {
      before[filePath] = content
      try {
        after[filePath] = readFileSync(filePath, 'utf-8')
      } catch {
        after[filePath] = content
      }
    }
    const all = this.loadTurns()
    const scopeId = buf.metadata?.sessionId ?? agentId
    const others = all.filter(t => (t.sessionId ?? t.agentId) !== scopeId)
    const mine = all.filter(t => (t.sessionId ?? t.agentId) === scopeId)
    const calls: Record<string, Record<string, string>> = {}
    for (const [callId, paths] of buf.calls) {
      const forCall: Record<string, string> = {}
      for (const filePath of paths) forCall[filePath] = before[filePath]
      calls[callId] = forCall
    }
    mine.push({ agentId, ...buf.metadata, ts: Date.now(), before, after, ...(buf.calls.size > 0 ? { calls } : {}) })
    mine.sort((a, b) => a.ts - b.ts)
    this.saveTurns([...others, ...mine.slice(-MAX_SNAPSHOTS)])
  }

  // Pops the latest turn and restores its pre-change (before) contents.
  undo(agentId: string): SnapshotTurn | null {
    const all = this.loadTurns()
    let idx = -1
    for (let i = all.length - 1; i >= 0; i--) {
      if ((all[i].sessionId ?? all[i].agentId) === agentId) {
        idx = i
        break
      }
    }
    if (idx < 0) return null
    const [turn] = all.splice(idx, 1)
    this.saveTurns(all)
    for (const [filePath, content] of Object.entries(turn.before)) {
      try {
        writeFileSync(filePath, content)
      } catch {
        /* file may have been deleted */
      }
    }
    return turn
  }

  // Restores the files one tool call touched and leaves the rest of its turn
  // in place, so undoTurn afterwards still restores what remains. Returns null
  // for a call this store never recorded — including every snapshot written
  // before call ids existed.
  undoCall(scopeId: string, callId: string): SnapshotTurn | null {
    const all = this.loadTurns()
    const turn = all.find(t => (t.sessionId ?? t.agentId) === scopeId && t.calls?.[callId])
    if (!turn?.calls) return null
    const files = turn.calls[callId]
    for (const [filePath, content] of Object.entries(files)) {
      try { writeFileSync(filePath, content) } catch { /* file may have been deleted */ }
    }
    delete turn.calls[callId]
    if (Object.keys(turn.calls).length === 0) delete turn.calls
    this.saveTurns(all)
    return turn
  }

  undoTurn(scopeId: string, turnId: string): SnapshotTurn | null {
    const all = this.loadTurns()
    let idx = -1
    for (let i = all.length - 1; i >= 0; i--) {
      const turn = all[i]
      if ((turn.sessionId ?? turn.agentId) === scopeId && turn.turnId === turnId) {
        idx = i
        break
      }
    }
    if (idx < 0) return null
    const [turn] = all.splice(idx, 1)
    this.saveTurns(all)
    for (const [filePath, content] of Object.entries(turn.before)) {
      try { writeFileSync(filePath, content) } catch { /* file may have been deleted */ }
    }
    return turn
  }

  // Re-inserts a turn (used by redo so the change can be undone again).
  pushTurn(turn: SnapshotTurn): void {
    const all = this.loadTurns()
    const scopeId = turn.sessionId ?? turn.agentId
    const others = all.filter(t => (t.sessionId ?? t.agentId) !== scopeId)
    const mine = all.filter(t => (t.sessionId ?? t.agentId) === scopeId)
    mine.push(turn)
    mine.sort((a, b) => a.ts - b.ts)
    this.saveTurns([...others, ...mine.slice(-MAX_SNAPSHOTS)])
  }

  // Earliest recorded pre-change content per file across history (for revert).
  originals(agentId: string): SnapshotFile[] {
    const seen = new Map<string, string>()
    for (const turn of this.turnsFor(agentId)) {
      for (const [filePath, content] of Object.entries(turn.before)) {
        if (!seen.has(filePath)) seen.set(filePath, content)
      }
    }
    return [...seen.entries()].map(([filePath, content]) => ({ filePath, content }))
  }

  clear(agentId: string): void {
    this.buffer.delete(agentId)
    this.saveTurns(this.loadTurns().filter(t => (t.sessionId ?? t.agentId) !== agentId))
  }
}
