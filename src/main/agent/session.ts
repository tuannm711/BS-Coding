import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { JsonStore } from '../json-store'
import {
  CHAT_SESSION_SCHEMA_VERSION,
  type ChatMessage,
  type ChatTranscriptItem,
  type ProjectSessionSummary,
  type SessionSummary,
  type TodoItem,
  type ToolCallData,
  type TurnExecutionSnapshot,
  type UsageSummary
} from '../../shared/types'

export const DEFAULT_SESSION_TITLE = 'New session'

export interface StoredSession {
  schemaVersion: typeof CHAT_SESSION_SCHEMA_VERSION
  id: string
  /** Legacy Agent ownership retained for compatibility during schema v2 migration. */
  agentId: string
  projectPath: string
  lastAgentId?: string
  legacyAgentId?: string
  title: string
  items: ChatTranscriptItem[]
  todos: TodoItem[]
  usage: UsageSummary
  createdAt: number
  updatedAt: number
}

export type { SessionSummary }

type RawSession = Partial<StoredSession> & Record<string, unknown>

function titleFrom(text: string): string {
  const line = text.split('\n').find(l => l.trim().length > 0)
  let t = (line ?? '').trim().replace(/\s+/g, ' ')
  if (t.length > 60) t = t.slice(0, 59) + '…'
  return t || DEFAULT_SESSION_TITLE
}

function titleFromItems(items: ChatTranscriptItem[]): string {
  for (const item of items) {
    if (item.kind === 'message' && item.message.role === 'user' && item.message.text.trim()) {
      return titleFrom(item.message.displayText ?? item.message.text)
    }
  }
  return DEFAULT_SESSION_TITLE
}

function normalize(raw: RawSession): StoredSession {
  const items: ChatTranscriptItem[] = Array.isArray(raw.items) ? (raw.items as ChatTranscriptItem[]) : []
  const id = String(raw.id ?? randomUUID())
  const legacyAgentId = String(raw.legacyAgentId ?? raw.agentId ?? raw.id ?? '')
  return {
    schemaVersion: CHAT_SESSION_SCHEMA_VERSION,
    id,
    agentId: legacyAgentId,
    projectPath: String(raw.projectPath ?? ''),
    lastAgentId: typeof raw.lastAgentId === 'string' && raw.lastAgentId ? raw.lastAgentId : legacyAgentId || undefined,
    legacyAgentId: legacyAgentId || undefined,
    title: typeof raw.title === 'string' && raw.title ? raw.title : titleFromItems(items),
    items,
    todos: Array.isArray(raw.todos) ? (raw.todos as TodoItem[]) : [],
    usage: raw.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : (raw.updatedAt ?? Date.now()),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
  }
}

function canonicalProjectPath(projectPath: string): string {
  const normalized = path.resolve(projectPath || '.').replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export class SessionStore {
  // Guarantees strictly-increasing updatedAt so ordering by it is always
  // deterministic even when mutations happen within the same millisecond.
  private lastUpdatedAt = 0

  constructor(private store: JsonStore<StoredSession>) {}

  private loadSessions(): StoredSession[] {
    const raw = this.store.load() as unknown as RawSession[]
    const normalized = raw.map(normalize)
    const latest = normalized.reduce((max, session) => Math.max(max, session.updatedAt), 0)
    this.lastUpdatedAt = Math.max(this.lastUpdatedAt, latest)
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) this.saveSessions(normalized)
    return normalized
  }

  private saveSessions(sessions: StoredSession[]): void {
    this.store.save(sessions)
  }

  private nextUpdatedAt(): number {
    const now = Date.now()
    if (now > this.lastUpdatedAt) this.lastUpdatedAt = now
    else this.lastUpdatedAt += 1
    return this.lastUpdatedAt
  }

  list(agentId: string): SessionSummary[] {
    return this.loadSessions()
      .filter(s => s.agentId === agentId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(s => ({
        id: s.id,
        agentId: s.agentId,
        title: s.title,
        messageCount: s.items.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
  }

  listProject(projectPath: string): ProjectSessionSummary[] {
    const canonical = canonicalProjectPath(projectPath)
    return this.loadSessions()
      .filter(session => canonicalProjectPath(session.projectPath) === canonical)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(session => ({
        id: session.id,
        projectPath: session.projectPath,
        lastAgentId: session.lastAgentId,
        title: session.title,
        messageCount: session.items.length,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }))
  }

  listAll(): StoredSession[] {
    return this.loadSessions()
  }

  get(id: string): StoredSession | null {
    return this.loadSessions().find(s => s.id === id) ?? null
  }

  latest(agentId: string): StoredSession | null {
    const all = this.loadSessions()
      .filter(s => s.agentId === agentId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return all[0] ?? null
  }

  latestProject(projectPath: string): StoredSession | null {
    const canonical = canonicalProjectPath(projectPath)
    return this.loadSessions()
      .filter(session => canonicalProjectPath(session.projectPath) === canonical)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  }

  create(agentId: string, projectPath: string): StoredSession {
    const session: StoredSession = {
      schemaVersion: CHAT_SESSION_SCHEMA_VERSION,
      id: randomUUID(),
      agentId,
      projectPath,
      lastAgentId: agentId || undefined,
      legacyAgentId: agentId || undefined,
      title: DEFAULT_SESSION_TITLE,
      items: [],
      todos: [],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
      createdAt: Date.now(),
      updatedAt: this.nextUpdatedAt()
    }
    this.saveSessions([...this.loadSessions(), session])
    return session
  }

  createProject(projectPath: string, lastAgentId?: string): StoredSession {
    return this.create(lastAgentId ?? '', projectPath)
  }

  setLastAgent(id: string, agentId: string): void {
    const all = this.loadSessions()
    const session = all.find(item => item.id === id)
    if (!session || session.lastAgentId === agentId) return
    session.lastAgentId = agentId
    session.updatedAt = this.nextUpdatedAt()
    this.saveSessions(all)
  }

  backfillLegacyExecution(
    resolve: (agentId: string) => Omit<TurnExecutionSnapshot, 'turnId' | 'startedAt' | 'completedAt' | 'status'> | null
  ): void {
    const all = this.loadSessions()
    let changed = false
    for (const session of all) {
      const agentId = session.legacyAgentId ?? session.agentId
      const metadata = agentId ? resolve(agentId) : null
      if (!metadata) continue
      let turnId: string | undefined
      let turnStartedAt = session.createdAt
      for (const item of session.items) {
        if (item.kind === 'message' && item.message.role === 'user') {
          turnId = item.message.turnId ?? `legacy:${session.id}:${item.message.id}`
          turnStartedAt = item.message.createdAt
          if (!item.message.turnId) {
            item.message.turnId = turnId
            changed = true
          }
          continue
        }
        if (!turnId) turnId = `legacy:${session.id}:initial`
        const execution: TurnExecutionSnapshot = {
          ...metadata,
          turnId,
          startedAt: turnStartedAt,
          completedAt: session.updatedAt,
          status: 'completed'
        }
        if (item.kind === 'message') {
          if (!item.message.turnId) { item.message.turnId = turnId; changed = true }
          if (!item.message.execution) { item.message.execution = execution; changed = true }
        } else {
          if (!item.tool.turnId) { item.tool.turnId = turnId; changed = true }
          if (!item.tool.execution) { item.tool.execution = execution; changed = true }
        }
      }
    }
    if (changed) this.saveSessions(all)
  }

  transcript(id: string): ChatTranscriptItem[] {
    return this.get(id)?.items ?? []
  }

  todos(id: string): TodoItem[] {
    return this.get(id)?.todos ?? []
  }

  setTodos(id: string, todos: TodoItem[]): void {
    const all = this.loadSessions()
    const idx = all.findIndex(s => s.id === id)
    if (idx < 0) return
    all[idx].todos = todos
    all[idx].updatedAt = this.nextUpdatedAt()
    this.saveSessions(all)
  }

  replaceItems(id: string, items: ChatTranscriptItem[]): void {
    const all = this.loadSessions()
    const idx = all.findIndex(s => s.id === id)
    if (idx < 0) return
    all[idx].items = items
    all[idx].updatedAt = this.nextUpdatedAt()
    this.saveSessions(all)
  }

  // Removes a single user message (e.g. a steered message the user deleted
  // after it was injected into the running turn).
  removeMessage(id: string, messageId: string): void {
    const all = this.loadSessions()
    const idx = all.findIndex(s => s.id === id)
    if (idx < 0) return
    const after = all[idx].items.filter(
      it => !(it.kind === 'message' && it.message.id === messageId)
    )
    if (after.length === all[idx].items.length) return
    all[idx].items = after
    all[idx].updatedAt = this.nextUpdatedAt()
    this.saveSessions(all)
  }

  // Cuts the transcript from the last user message onwards (used by undo) and
  // returns the removed items.
  truncateFromLastUser(id: string): ChatTranscriptItem[] {
    const all = this.loadSessions()
    const idx = all.findIndex(s => s.id === id)
    if (idx < 0) return []
    const items = all[idx].items
    let cut = -1
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]
      if (item.kind === 'message' && item.message.role === 'user') {
        cut = i
        break
      }
    }
    if (cut < 0) return []
    const removed = items.splice(cut)
    all[idx].updatedAt = this.nextUpdatedAt()
    this.saveSessions(all)
    return removed
  }

  appendMessage(id: string, message: ChatMessage): void {
    const all = this.loadSessions()
    const idx = all.findIndex(s => s.id === id)
    if (idx < 0) return
    const session = all[idx]
    session.items.push({ kind: 'message', message })
    if (session.title === DEFAULT_SESSION_TITLE && message.role === 'user' && message.text.trim()) {
      session.title = titleFrom(message.displayText ?? message.text)
    }
    session.updatedAt = this.nextUpdatedAt()
    this.saveSessions(all)
  }

  appendTool(id: string, tool: ToolCallData): void {
    const all = this.loadSessions()
    const idx = all.findIndex(s => s.id === id)
    if (idx < 0) return
    const session = all[idx]
    session.items.push({ kind: 'tool', tool })
    session.updatedAt = this.nextUpdatedAt()
    this.saveSessions(all)
  }

  setTitle(id: string, title: string): void {
    const all = this.loadSessions()
    const idx = all.findIndex(s => s.id === id)
    if (idx < 0) return
    all[idx].title = title
    this.saveSessions(all)
  }

  touch(id: string): void {
    const all = this.loadSessions()
    const idx = all.findIndex(s => s.id === id)
    if (idx < 0) return
    all[idx].updatedAt = this.nextUpdatedAt()
    this.saveSessions(all)
  }

  getUsage(id: string): UsageSummary {
    return this.get(id)?.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }
  }

  addUsage(id: string, usage: UsageSummary): void {
    const all = this.loadSessions()
    const idx = all.findIndex(s => s.id === id)
    if (idx < 0) return
    const s = all[idx].usage
    all[idx].usage = {
      input: s.input + usage.input,
      output: s.output + usage.output,
      cacheRead: s.cacheRead + usage.cacheRead,
      cacheWrite: s.cacheWrite + usage.cacheWrite,
      cost: s.cost + usage.cost
    }
    all[idx].updatedAt = this.nextUpdatedAt()
    this.saveSessions(all)
  }

  delete(id: string): void {
    this.saveSessions(this.loadSessions().filter(s => s.id !== id))
  }

  deleteForAgent(agentId: string): void {
    this.saveSessions(this.loadSessions().filter(s => s.agentId !== agentId))
  }
}
