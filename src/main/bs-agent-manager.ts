import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { ChatEvent, ChatMessage, ChatTranscriptItem, ContextInfo, FileSuggestion, ImageAttachment, McpServerStatus, BsSettings, MessageTokens, ModelUsage, NotificationsSettings, ProjectSessionSummary, PromptResponse, QueuedMessage, ResolvedTurnExecutionSnapshot, StatsSummary, TodoItem, TraceEvent, UsageSummary, ProviderConnection } from '../shared/types'
import type { AgentConfig, AgentMode, ArtifactEntry, CatalogProviderSummary, Command, ModelRef, SubagentType } from '../shared/types'
import {
  configToSettings, loadBsConfig, resolveAgentConfig, settingsToConfig, writeBsConfig,
  type BsConfig, type ResolvedAgentConfig
} from './agent/config'
import { SessionRunner } from './agent/loop'
import { createLlm } from './agent/llm'
import type { LlmClient } from './agent/llm'
import { decidePermission } from './agent/permission'
import { SessionStore, DEFAULT_SESSION_TITLE, titleFrom } from './agent/session'
import { titleSession } from './agent/compact'
import type { SessionSummary, StoredSession } from './agent/session'
import { McpManager } from './agent/mcp/manager'
import { collectSkills, skillListText } from './agent/skill'
import { loadUserTools } from './agent/plugin'
import { instructionsText, loadInstructions } from './agent/instructions'
import { referenceHints } from './agent/references'
import { suggestFiles } from './file-suggest'
import { SnapshotStore } from './agent/snapshot'
import type { SnapshotTurn } from './agent/snapshot'
import { TruncationStore } from './agent/truncation'
import { CommandStore, uniqueCommands, projectCommands, resolveCommand } from './agent/commands'
import { calcCost, EMPTY_USAGE } from './agent/usage'
import type { ModelPrice } from './agent/usage'
import { LspManager } from './agent/lsp/manager'
import { createLspTool } from './agent/tools/lsp'
import { SavedPermissions } from './agent/saved-permissions'
import { ModelsCatalog } from './models-catalog'
import type { VariantBody } from './model-variants'
import { revertTool } from './agent/tools/revert'
import { createTaskTool } from './agent/tools/task'
import type { ResolvedSubagentModel } from './agent/tools/task'
import type { ToolDefinition } from './agent/tools/types'
import type { NotificationService } from './notification-service'
import type { Vault } from './vault'
import { TraceStore } from './agent/trace-store'
import type { TraceEventInput } from './agent/trace-store'
import type { AgentAssignmentSetRequest, AgentAssignmentSnapshot } from '../shared/provider-state'
import { classifyRuntimeError } from '../shared/provider-state'
import { AssignmentStore, fileAssignmentPersistence } from './agent/assignments'
import { SharedSessionCoordinator } from './agent/shared-session-coordinator'
import { compileNeutralContext } from './agent/neutral-context'
import { rankFallbackAgents, type FallbackCandidate } from '../shared/agent-fallback'
import { poolState } from '../shared/quota-pool'
import { looksLikeNarratedToolCall } from '../shared/narrated-tool-call'
import { toLlmMessages } from './agent/message'

export interface BsAgentManagerDeps {
  configPath: string
  vault?: Vault
  store: SessionStore
  trace?: TraceStore
  onTrace?: (e: TraceEvent) => void
  tools: Map<string, ToolDefinition>
  createLlm?: (provider: string, apiKey: string, baseUrl?: string, headers?: Record<string, string>) => LlmClient
  env?: NodeJS.ProcessEnv
  userSkillsDir?: string
  userToolsDir?: string
  builtinSkillsDir?: string
  snapshots: SnapshotStore
  savedPermissions: SavedPermissions
  catalog?: ModelsCatalog
  truncation: TruncationStore
  commands?: CommandStore
  prices?: Record<string, { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }>
  projectPath?: string
  lsp?: LspManager
  notify?: NotificationService
  onActivateAgent?: (agentId: string) => void
  onBackgroundChange?: (agentId: string, background: boolean) => void
  onArtifact?: (entry: Omit<ArtifactEntry, 'id' | 'ts'>) => void
  notifications?: NotificationsSettings
  providerAccounts?: () => ProviderConnection[]
  onAssignmentChanged?: (assignment: AgentAssignmentSnapshot) => void
  assignmentPath?: string
  providerRuntime?: (providerId: string, accountId: string, modelId: string) => LlmClient
  /** Which quota pool a model draws on. Supplied by the provider layer. */
  quotaGroupForModel?: (providerId: string, modelId: string) => string | undefined
}

function unavailableProviderRuntime(providerId: string): LlmClient {
  return {
    async *stream() {
      yield { kind: 'error', error: `[bs] Provider runtime adapter không khả dụng cho ${providerId}` }
    }
  }
}

const SHARED_SESSION_RECORD_NOTE = '\n\nThis session is shared between agents. Blocks headed ' +
  '"[Session log ...]" in the history are records of tools that already ran; they are not ' +
  'messages and not a format to reproduce. To use a tool, call it through the tool interface. ' +
  'Writing out what a call would look like does not run anything.'

export class BsAgentManager {
  private runners = new Map<string, SessionRunner>()
  private agents = new Map<string, AgentConfig>()
  // Who is serving the running turn, and who has already been tried. Keyed by
  // lifecycle key so a turn stays one turn across a handover.
  private turnTargets = new Map<string, { agentId: string; tried: Set<string> }>()
  private resolved = new Map<string, ResolvedAgentConfig>()
  private controllers = new Map<string, AbortController>()
  private pendingPrompts = new Map<string, { agentId: string; tool?: string; resolve: (resp: PromptResponse | null) => void }>()
  private running = new Set<string>()
  // Sessions already given a model-written title, so one is never asked for twice.
  // Not persisted: a restart may spend one more request, which is cheaper than
  // another field in the store.
  private titledSessions = new Set<string>()
  private activeSessions = new Map<string, string>()
  private tools: Map<string, ToolDefinition>
  private modes = new Map<string, AgentMode>()
  private mcp = new McpManager()
  private modelLimits = new Map<string, { context?: number; output?: number }>()
  private modelVariants = new Map<string, Record<string, VariantBody>>()
  private redoStacks = new Map<string, Array<{ items: ChatTranscriptItem[]; turn?: SnapshotTurn; agentId: string; turnId: string }>>()
  private backgrounds = new Map<string, boolean>()
  private queues = new Map<string, QueuedMessage[]>()
  private onEvent: (e: ChatEvent) => void = () => {}
  private turnCounters = new Map<string, number>()
  private toolStartTs = new Map<string, number>()
  private pendingMessages = new Map<string, { turn: number; text: string; reasoning: string; tokens?: MessageTokens }>()
  private traceEnabled = false
  private lastUsageByAgent = new Map<string, MessageTokens>()
  private compacting = new Set<string>()
  private lastCompactionAt = new Map<string, number>()
  private idleCompactTimer: ReturnType<typeof setInterval> | null = null
  private assignments: AssignmentStore
  private coordinator: SharedSessionCoordinator
  private activeProjectSessions = new Map<string, string>()
  private sessionExecutions = new Map<string, {
    projectPath: string
    sessionId: string
    execution: ResolvedTurnExecutionSnapshot
    usage: UsageSummary
  }>()

  constructor(private deps: BsAgentManagerDeps) {
    this.tools = new Map(deps.tools)
    const cfg = loadBsConfig(deps.configPath)
    this.deps = { ...deps, notifications: cfg.notifications }
    this.assignments = new AssignmentStore(fileAssignmentPersistence(deps.assignmentPath ?? `${deps.configPath}.assignments.json`, deps.configPath))
    this.traceEnabled = cfg.trace?.enabled ?? false
    // Auto-compact when a session sits over its context limit while idle
    // (compaction otherwise only runs at the start of a turn step).
    this.idleCompactTimer = setInterval(() => void this.maybeCompactIdle(), 20_000)
    this.idleCompactTimer.unref?.()
    this.coordinator = new SharedSessionCoordinator(deps.store)
  }

  setOnEvent(cb: (e: ChatEvent) => void): void {
    this.onEvent = (e) => {
      if (e.type === 'done' || e.type === 'error') this.running.delete(this.lifecycleKey(e.agentId))
      cb(e)
      if (this.traceEnabled) this.writeTrace(e)
      if (e.type === 'done' && this.deps.notifications?.onDone !== false) {
        const cost = e.cost !== undefined ? ` · ${e.cost.toFixed(4)}` : ''
        this.deps.notify?.notify({
          title: '[bs] Hoàn thành',
          body: `${this.agents.get(e.agentId)?.name ?? e.agentId}${e.reason ? ` (${e.reason})` : ''}${cost}`,
          agentId: e.agentId,
          onActivate: () => this.deps.onActivateAgent?.(e.agentId)
        })
      } else if (e.type === 'error' && this.deps.notifications?.onDone !== false) {
        this.deps.notify?.notify({
          title: '[bs] Lỗi',
          body: `${this.agents.get(e.agentId)?.name ?? e.agentId}: ${e.message}`,
          agentId: e.agentId,
          onActivate: () => this.deps.onActivateAgent?.(e.agentId)
        })
      }
    }
  }

  setProjectPath(projectPath: string): void {
    this.deps = { ...this.deps, projectPath }
  }

  isNative(agentId: string): boolean {
    return this.agents.has(agentId)
  }

  isTraceEnabled(): boolean {
    return this.traceEnabled
  }

  isRunning(agentId: string): boolean {
    return this.running.has(this.lifecycleKey(agentId))
  }

  isBackground(agentId: string): boolean {
    return this.backgrounds.get(agentId) ?? false
  }

  async suggestFiles(agentId: string, prefix: string): Promise<FileSuggestion[]> {
    const agent = this.agents.get(agentId)
    if (!agent) return []
    return suggestFiles(agent.cwd, prefix)
  }

  setBackground(agentId: string, background: boolean): void {
    this.backgrounds.set(agentId, background)
    this.deps.onBackgroundChange?.(agentId, background)
  }

  async init(agents: AgentConfig[]): Promise<void> {
    const cfg = loadBsConfig(this.deps.configPath)
    const migrationCandidates = agents.filter(agent => {
      const profile = cfg.agents[agent.name]
      return Boolean(agent.model || agent.accountId || profile?.provider || profile?.model || profile?.accountId)
    })
    this.assignments.migrate(cfg, migrationCandidates, assignment => {
      const connection = this.deps.providerAccounts?.().find(item => item.providerId === assignment.providerId)
      if (connection) {
        const accounts = assignment.accountId
          ? connection.accounts.filter(account => account.id === assignment.accountId)
          : connection.accounts
        return accounts.some(account => account.status === 'active' && account.models?.includes(assignment.modelId))
      }
      return cfg.provider[assignment.providerId]?.models.includes(assignment.modelId) ?? false
    })
    await this.syncTools()
    await this.refreshModelLimits()
    for (const agent of agents) {
      if (agent.kind === 'native') this.register(agent, true)
    }
    this.deps.store.backfillLegacyExecution(agentId => {
      const agent = this.agents.get(agentId)
      const resolved = this.resolved.get(agentId)
      if (!agent || !resolved) return null
      return {
        agentId,
        agentName: agent.name,
        providerId: resolved.provider || undefined,
        accountId: resolved.accountId,
        modelId: resolved.model || undefined,
        speed: agent.speed ?? 'standard'
      }
    })
    this.coordinator.reconcileAgents([...this.agents.values()])
  }

  addAgent(agent: AgentConfig): void {
    if (agent.kind === 'native') this.register(agent)
  }

  listAgents(): AgentConfig[] {
    return [...this.agents.values()]
  }

  removeAgent(agentId: string): void {
    for (const context of [...this.sessionExecutions.values()]) {
      if (context.execution.agentId !== agentId) continue
      context.execution.status = 'stopped'
      this.controllers.get(context.sessionId)?.abort()
      this.coordinator.stop(context.sessionId)
      this.sessionExecutions.delete(context.sessionId)
    }
    this.stop(agentId)
    this.runners.delete(agentId)
    this.agents.delete(agentId)
    this.resolved.delete(agentId)
    this.assignments.remove(agentId)
    this.activeSessions.delete(agentId)
    this.backgrounds.delete(agentId)
    this.queues.delete(agentId)
    this.coordinator.reconcileAgents([...this.agents.values()])
  }

  private summary(session: StoredSession): SessionSummary {
    return {
      id: session.id,
      agentId: session.agentId,
      title: session.title,
      messageCount: session.items.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }
  }

  private activeSessionId(agentId: string): string {
    const existing = this.activeSessions.get(agentId)
    if (existing && this.deps.store.get(existing)) return existing
    const latest = this.deps.store.latest(agentId)
    const id = latest?.id ?? this.deps.store.create(agentId, this.agents.get(agentId)?.cwd ?? '').id
    this.activeSessions.set(agentId, id)
    return id
  }

  listSessions(agentId: string): SessionSummary[] {
    return this.deps.store.list(agentId)
  }

  createSession(agentId: string): SessionSummary {
    this.stop(agentId)
    const session = this.deps.store.create(agentId, this.agents.get(agentId)?.cwd ?? '')
    this.activeSessions.set(agentId, session.id)
    return this.summary(session)
  }

  switchSession(agentId: string, sessionId: string): SessionSummary | null {
    const session = this.deps.store.get(sessionId)
    if (!session || session.agentId !== agentId) return null
    this.stop(agentId)
    this.activeSessions.set(agentId, sessionId)
    this.deps.store.touch(sessionId)
    return this.summary(session)
  }

  deleteSession(agentId: string, sessionId: string): SessionSummary {
    const wasActive = this.activeSessions.get(agentId) === sessionId
    this.deps.store.delete(sessionId)
    this.deps.trace?.delete(sessionId)
    let next: StoredSession
    if (wasActive) {
      next = this.deps.store.latest(agentId) ?? this.deps.store.create(agentId, this.agents.get(agentId)?.cwd ?? '')
    } else {
      next = this.deps.store.get(this.activeSessions.get(agentId) ?? '')
        ?? this.deps.store.create(agentId, this.agents.get(agentId)?.cwd ?? '')
    }
    this.activeSessions.set(agentId, next.id)
    return this.summary(next)
  }

  private MAX_QUEUE = 5

  emitQueue(agentId: string): void {
    this.emit({ type: 'queue-updated', agentId, queue: this.queues.get(agentId) ?? [] })
  }

  listQueued(agentId: string): QueuedMessage[] {
    return this.queues.get(agentId) ?? []
  }

  removeQueued(agentId: string, id: string): void {
    const q = this.queues.get(agentId) ?? []
    const next = q.filter(m => m.id !== id)
    if (next.length !== q.length) {
      if (next.length === 0) this.queues.delete(agentId)
      else this.queues.set(agentId, next)
      this.emitQueue(agentId)
    }
    // If the message was already injected into the running turn, drop it from
    // the transcript too so the bubble disappears everywhere.
    this.deps.store.removeMessage(this.activeSessionId(agentId), id)
    this.emit({ type: 'message-removed', agentId, messageId: id })
  }

  editQueued(agentId: string, id: string, text: string): void {
    const q = this.queues.get(agentId) ?? []
    const idx = q.findIndex(m => m.id === id)
    if (idx < 0 || !text.trim()) return
    q[idx] = { ...q[idx], text, displayText: undefined }
    this.queues.set(agentId, q)
    this.emitQueue(agentId)
  }

  async sendInSession(
    projectPath: string,
    sessionId: string,
    agentId: string,
    text: string,
    images?: ImageAttachment[],
    displayText?: string
  ): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent || !this.deps.store.listProject(projectPath).some(session => session.id === sessionId)) return
    const existing = this.coordinator.state(sessionId)
    if (existing) {
      if (existing.queue.length >= this.MAX_QUEUE) {
        this.emit({ type: 'error', agentId: existing.agentId, message: '[bs] Hàng đợi đã đầy (tối đa 5 tin).' })
        return
      }
      this.coordinator.enqueue(sessionId, { id: randomUUID(), agentId: existing.agentId, text, images, displayText })
      this.emitSessionQueue(sessionId)
      return
    }
    const state = this.coordinator.acquire(projectPath, sessionId, agentId)
    const resolved = this.resolved.get(agentId)
    const assignment = this.assignments.get(agentId)
    const providerId = assignment?.providerId || resolved?.provider
    const modelId = assignment?.modelId || resolved?.model
    if (!providerId || !modelId) {
      this.coordinator.fail(sessionId)
      this.emit({ type: 'error', agentId, message: '[bs] Agent assignment cần được review trong Settings trước khi chat.' })
      return
    }
    const connection = this.deps.providerAccounts?.().find(item => item.providerId === providerId)
    const accountId = assignment?.accountId ?? resolved?.accountId
    const account = connection?.accounts.find(item => item.id === accountId)
    const execution: ResolvedTurnExecutionSnapshot = {
      turnId: state.turnId,
      agentId,
      agentName: agent.name,
      providerId,
      accountId,
      accountLabel: account?.label,
      modelId,
      modelLabel: modelId,
      speed: agent.speed ?? assignment?.speed ?? 'standard',
      startedAt: Date.now(),
      status: 'running'
    }
    this.activeSessions.set(agentId, sessionId)
    this.activeProjectSessions.set(projectPath, sessionId)
    this.sessionExecutions.set(sessionId, { projectPath, sessionId, execution, usage: { ...EMPTY_USAGE } })
    try {
      await this.runTurn(agentId, text, images, displayText)
    } finally {
      const finalStatus = execution.status === 'running' ? 'completed' : execution.status
      this.deps.store.finishExecution(execution.turnId, finalStatus, Date.now())
      const context = this.sessionExecutions.get(sessionId)
      if (finalStatus === 'completed' && context) this.deps.store.addUsage(sessionId, context.usage)
      const next = finalStatus === 'completed' ? this.coordinator.dequeue(sessionId) : undefined
      if (finalStatus === 'completed') this.coordinator.complete(sessionId)
      else if (finalStatus === 'stopped') this.coordinator.stop(sessionId)
      else this.coordinator.fail(sessionId)
      this.sessionExecutions.delete(sessionId)
      if (next) {
        this.coordinator.stop(sessionId)
        await this.sendInSession(projectPath, sessionId, next.agentId, next.text, next.images, next.displayText)
      }
    }
  }

  getSessionState(sessionId: string) {
    return this.coordinator.state(sessionId)
  }

  listSessionQueued(sessionId: string) {
    return this.coordinator.state(sessionId)?.queue ?? []
  }

  stopSessionChat(_projectPath: string, sessionId: string): void {
    const state = this.coordinator.state(sessionId)
    if (!state) return
    const execution = this.sessionExecutions.get(sessionId)?.execution
    if (execution) execution.status = 'stopped'
    this.controllers.get(sessionId)?.abort()
    this.resolvePendingFor(state.agentId, null)
    this.coordinator.stop(sessionId)
    this.emit({ type: 'queue-updated', agentId: state.agentId, queue: [] })
  }

  private emitSessionQueue(sessionId: string): void {
    const state = this.coordinator.state(sessionId)
    if (!state) return
    this.emit({ type: 'queue-updated', agentId: state.agentId, queue: state.queue })
  }

  async send(agentId: string, text: string, images?: ImageAttachment[], displayText?: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) return
    if (this.running.has(agentId)) {
      const q = this.queues.get(agentId) ?? []
      if (q.length >= this.MAX_QUEUE) {
        this.emit({ type: 'error', agentId, message: '[bs] Hàng đợi đã đầy (tối đa 5 tin). Hãy chờ turn hiện tại xong hoặc xóa tin đang chờ.' })
        return
      }
      q.push({ id: randomUUID(), text, images, displayText })
      this.queues.set(agentId, q)
      this.emitQueue(agentId)
      return
    }
    await this.runTurn(agentId, text, images, displayText)
    await this.drainQueue(agentId)
  }

  private async drainQueue(agentId: string): Promise<void> {
    if (this.running.has(agentId)) return
    const q = this.queues.get(agentId)
    if (!q || q.length === 0) return
    const next = q.shift()!
    if (q.length === 0) this.queues.delete(agentId)
    else this.queues.set(agentId, q)
    this.emitQueue(agentId)
    await this.runTurn(agentId, next.text, next.images, next.displayText)
    await this.drainQueue(agentId)
  }

  private async runTurn(agentId: string, text: string, images?: ImageAttachment[], displayText?: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) return
    const message: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      text: referenceHints(agent.cwd, text),
      displayText: displayText ?? text,
      images,
      turnId: this.executionForAgent(agentId)?.execution.turnId,
      execution: this.executionForAgent(agentId)?.execution,
      createdAt: Date.now()
    }
    this.deps.store.appendMessage(this.activeSessionId(agentId), message)
    this.emit({ type: 'user-message', agentId, message })
    const config = this.resolved.get(agentId)
    const storedAssignment = this.assignments.get(agentId)
    if (storedAssignment && storedAssignment.status !== 'ready') {
      this.emit({ type: 'error', agentId, message: '[bs] Agent assignment cần được review trong Settings trước khi chat.' })
      return
    }
    if (!config?.apiKey && !config?.accountId) {
      this.emit({
        type: 'error',
        agentId,
        message:
          '[bs] Chưa cấu hình provider/API key. Mở Settings, thêm provider (id + API key + models) rồi thử lại.'
      })
      return
    }

    const runner = this.runners.get(agentId)
    if (!runner) return
    const controller = new AbortController()
    const lifecycleKey = this.lifecycleKey(agentId)
    const executionContext = this.executionForAgent(agentId)
    this.controllers.set(lifecycleKey, controller)
    this.running.add(lifecycleKey)
    this.nextTurn(agentId)
    this.emit({ type: 'turn-started', agentId })
    this.redoStacks.delete(lifecycleKey)
    this.deps.snapshots.beginTurn(lifecycleKey, executionContext ? {
      projectPath: executionContext.projectPath,
      sessionId: executionContext.sessionId,
      turnId: executionContext.execution.turnId,
      agentId
    } : undefined)
    try {
      await runner.run(controller.signal)
    } finally {
      this.deps.snapshots.commitTurn(lifecycleKey)
      this.turnTargets.delete(lifecycleKey)
      this.running.delete(lifecycleKey)
      this.controllers.delete(lifecycleKey)
      this.resolvePendingFor(agentId, null)
    }
  }

  // Undoes the last completed turn: restores pre-turn file contents and drops
  // the turn's transcript items. Returns true if a turn was undone.
  undo(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false
    this.stop(agentId)
    const turn = this.deps.snapshots.undo(agentId)
    if (!turn) return false
    const sessionId = this.activeSessionId(agentId)
    const removed = this.deps.store.truncateFromLastUser(sessionId)
    if (removed.length > 0) {
      const stack = this.redoStacks.get(agentId) ?? []
      stack.push({ items: removed, turn, agentId, turnId: turn.turnId ?? '' })
      this.redoStacks.set(agentId, stack)
    }
    return true
  }

  // Re-applies a previously undone turn: restores the post-turn file contents
  // and re-inserts the removed transcript items.
  redo(agentId: string): boolean {
    const stack = this.redoStacks.get(agentId)
    const entry = stack?.pop()
    if (!entry) return false
    if (stack && stack.length === 0) this.redoStacks.delete(agentId)
    const { items, turn } = entry
    for (const [filePath, content] of Object.entries(turn?.after ?? {})) {
      try {
        writeFileSync(filePath, content)
      } catch {
        /* file may be missing */
      }
    }
    if (turn) this.deps.snapshots.pushTurn(turn)
    const sessionId = this.activeSessionId(agentId)
    for (const item of items) {
      if (item.kind === 'message') this.deps.store.appendMessage(sessionId, item.message)
      else this.deps.store.appendTool(sessionId, item.tool)
    }
    return true
  }

  undoSession(projectPath: string, sessionId: string): { agentId: string; turnId: string } | null {
    if (!this.deps.store.listProject(projectPath).some(session => session.id === sessionId)) return null
    this.stopSessionChat(projectPath, sessionId)
    const items = this.deps.store.transcript(sessionId)
    const latest = [...items].reverse().find(item => {
      const execution = item.kind === 'message' ? item.message.execution : item.tool.execution
      return execution?.status === 'completed'
    })
    const execution = latest && (latest.kind === 'message' ? latest.message.execution : latest.tool.execution)
    if (!execution) return null
    const turn = this.deps.snapshots.undoTurn(sessionId, execution.turnId) ?? undefined
    const removed = this.deps.store.truncateTurn(sessionId, execution.turnId)
    if (removed.length === 0) {
      if (turn) this.deps.snapshots.pushTurn(turn)
      return null
    }
    const stack = this.redoStacks.get(sessionId) ?? []
    stack.push({ items: removed, turn, agentId: execution.agentId, turnId: execution.turnId })
    this.redoStacks.set(sessionId, stack)
    return { agentId: execution.agentId, turnId: execution.turnId }
  }

  redoSession(projectPath: string, sessionId: string): { agentId: string; turnId: string } | null {
    if (!this.deps.store.listProject(projectPath).some(session => session.id === sessionId)) return null
    const stack = this.redoStacks.get(sessionId)
    const entry = stack?.pop()
    if (!entry) return null
    if (stack?.length === 0) this.redoStacks.delete(sessionId)
    for (const [filePath, content] of Object.entries(entry.turn?.after ?? {})) {
      try { writeFileSync(filePath, content) } catch { /* file may be missing */ }
    }
    if (entry.turn) this.deps.snapshots.pushTurn(entry.turn)
    for (const item of entry.items) {
      if (item.kind === 'message') this.deps.store.appendMessage(sessionId, item.message)
      else this.deps.store.appendTool(sessionId, item.tool)
    }
    return { agentId: entry.agentId, turnId: entry.turnId }
  }

  // Costs one short non-streaming request against the account's provider quota,
  // once per session. Skipped when the user has already chosen a title, and
  // marked before the await so two done events cannot both spend a request.
  private async maybeTitleSession(agentId: string, llm: LlmClient | undefined, model: string): Promise<void> {
    if (!llm) return
    const sessionId = this.activeSessionId(agentId)
    if (!sessionId || this.titledSessions.has(sessionId)) return
    const session = this.deps.store.get(sessionId)
    if (!session) return
    const firstUser = session.items.find(item => item.kind === 'message' && item.message.role === 'user')
    if (!firstUser || firstUser.kind !== 'message') return
    const text = firstUser.message.displayText ?? firstUser.message.text
    if (!text.trim()) return
    if (session.title !== titleFrom(text) && session.title !== DEFAULT_SESSION_TITLE) return
    this.titledSessions.add(sessionId)
    const title = await titleSession({ llm, model, prompt: text })
    if (title) this.deps.store.setTitle(sessionId, title)
  }

  renameSession(agentId: string, sessionId: string, title: string): SessionSummary | null {
    const session = this.deps.store.get(sessionId)
    if (!session || session.agentId !== agentId) return null
    this.deps.store.setTitle(sessionId, title)
    return this.summary(this.deps.store.get(sessionId)!)
  }

  stop(agentId: string): void {
    const key = this.lifecycleKey(agentId)
    this.controllers.get(key)?.abort()
    this.controllers.delete(key)
    this.running.delete(key)
    this.resolvePendingFor(agentId, null)
  }

  // User-facing stop: aborts the active turn, keeps the queue, and immediately
  // starts the next queued message (if any).
  async stopAndDrain(agentId: string): Promise<void> {
    this.stop(agentId)
    await this.drainQueue(agentId)
  }

  stopAll(): void {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
    this.running.clear()
    for (const agentId of this.agents.keys()) this.resolvePendingFor(agentId, null)
  }

  newSession(agentId: string): SessionSummary {
    return this.createSession(agentId)
  }

  listMessages(agentId: string): ChatMessage[] {
    const session = this.deps.store.get(this.activeSessionId(agentId))
    if (!session) return []
    return session.items
      .filter((i): i is { kind: 'message'; message: ChatMessage } => i.kind === 'message')
      .map(i => i.message)
  }

  listTranscript(agentId: string): ChatTranscriptItem[] {
    return this.deps.store.transcript(this.activeSessionId(agentId))
  }

  getTodos(agentId: string): TodoItem[] {
    return this.deps.store.todos(this.activeSessionId(agentId))
  }

  respondPrompt(agentId: string, promptId: string, resp: PromptResponse): void {
    const entry = this.pendingPrompts.get(promptId)
    if (entry && entry.agentId === agentId) {
      this.pendingPrompts.delete(promptId)
      const turnId = this.executionForAgent(agentId)?.execution.turnId
      if (turnId) this.coordinator.setPrompt(turnId, undefined)
      if (resp.always && resp.allow && entry.tool) {
        const agent = this.agents.get(agentId)
        if (agent) this.deps.savedPermissions.save(agent.cwd, entry.tool)
      }
      entry.resolve(resp)
    }
  }

  setMode(agentId: string, mode: AgentMode): void {
    this.modes.set(agentId, mode)
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.mode = mode
      this.agents.set(agentId, agent)
      // Rebuild even while a turn is running: the in-flight runner keeps its
      // own reference, but the next turn must see the new mode in its system
      // prompt instead of the one baked when the session's first turn ran.
      this.runners.delete(agentId)
      this.resolved.delete(agentId)
      this.register(agent)
    }
  }

  setVariant(agentId: string, variant: string | undefined): void {
    const agent = this.agents.get(agentId)
    if (!agent) return
    const allowed = this.allowedVariantsFor(agent)
    const valid = variant && allowed.includes(variant) ? variant : undefined
    agent.variant = valid
    this.agents.set(agentId, agent)
    this.runners.delete(agentId)
    this.resolved.delete(agentId)
    this.register(agent)
  }

  setModel(agentId: string, provider: string, model: string): void {
    const agent = this.agents.get(agentId)
    if (!agent) return
    const connection = this.deps.providerAccounts?.().find(item => item.providerId === provider)
    if (connection) {
      this.setAgentAssignmentSnapshot({ agentId, providerId: provider, accountId: agent.accountId ?? connection.activeAccountId ?? undefined, modelId: model, speed: agent.speed ?? 'standard' })
      return
    }
    agent.model = `${provider}/${model}`
    this.persistAssignment(agentId, provider, model, agent.accountId, agent.speed)
    this.agents.set(agentId, agent)
    this.runners.delete(agentId)
    this.resolved.delete(agentId)
    this.register(agent)
  }

  private projectSummary(session: StoredSession): ProjectSessionSummary {
    return {
      id: session.id,
      projectPath: session.projectPath,
      lastAgentId: session.lastAgentId,
      title: session.title,
      messageCount: session.items.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }
  }

  listProjectSessions(projectPath: string): ProjectSessionSummary[] {
    return this.deps.store.listProject(projectPath)
  }

  createProjectSession(projectPath: string, agentId?: string): ProjectSessionSummary {
    const session = this.deps.store.createProject(projectPath, agentId)
    this.activeProjectSessions.set(projectPath, session.id)
    return this.projectSummary(session)
  }

  switchProjectSession(projectPath: string, sessionId: string): ProjectSessionSummary | null {
    const session = this.deps.store.get(sessionId)
    if (!session || !this.deps.store.listProject(projectPath).some(item => item.id === sessionId)) return null
    this.activeProjectSessions.set(projectPath, sessionId)
    if (session.lastAgentId) this.activeSessions.set(session.lastAgentId, sessionId)
    this.deps.store.touch(sessionId)
    return this.projectSummary(this.deps.store.get(sessionId)!)
  }

  selectProjectSessionAgent(projectPath: string, sessionId: string, agentId: string): ProjectSessionSummary {
    const selected = this.coordinator.selectAgent(projectPath, sessionId, agentId, [...this.agents.values()])
    this.activeSessions.set(agentId, sessionId)
    return selected
  }

  deleteProjectSession(projectPath: string, sessionId: string): ProjectSessionSummary {
    const session = this.deps.store.get(sessionId)
    if (!session || !this.deps.store.listProject(projectPath).some(item => item.id === sessionId)) {
      throw new Error(`[bs] Session ${sessionId} does not belong to ${projectPath}`)
    }
    this.stopSessionChat(projectPath, sessionId)
    this.deps.store.delete(sessionId)
    this.deps.snapshots.clear(sessionId)
    this.deps.trace?.delete(sessionId)
    const next = this.deps.store.latestProject(projectPath)
      ?? this.deps.store.createProject(projectPath, this.coordinator.resolveAgent(session.lastAgentId, [...this.agents.values()]) ?? undefined)
    this.activeProjectSessions.set(projectPath, next.id)
    return this.projectSummary(next)
  }

  renameProjectSession(projectPath: string, sessionId: string, title: string): ProjectSessionSummary | null {
    if (!this.deps.store.listProject(projectPath).some(session => session.id === sessionId)) return null
    this.deps.store.setTitle(sessionId, title)
    const session = this.deps.store.get(sessionId)
    return session ? this.projectSummary(session) : null
  }

  listSessionTranscript(projectPath: string, sessionId: string): ChatTranscriptItem[] {
    if (!this.deps.store.listProject(projectPath).some(item => item.id === sessionId)) return []
    return this.deps.store.transcript(sessionId)
  }

  listSessionTodos(projectPath: string, sessionId: string): TodoItem[] {
    if (!this.deps.store.listProject(projectPath).some(item => item.id === sessionId)) return []
    return this.deps.store.todos(sessionId)
  }

  getSessionUsage(projectPath: string, sessionId: string): UsageSummary {
    if (!this.deps.store.listProject(projectPath).some(item => item.id === sessionId)) return { ...EMPTY_USAGE }
    return this.deps.store.getUsage(sessionId)
  }

  isSessionChatRunning(projectPath: string, sessionId: string): boolean {
    return this.deps.store.listProject(projectPath).some(item => item.id === sessionId)
      && this.coordinator.state(sessionId) !== null
  }

  removeSessionQueued(projectPath: string, sessionId: string, messageId: string): void {
    if (!this.deps.store.listProject(projectPath).some(item => item.id === sessionId)) return
    if (this.coordinator.removeQueued(sessionId, messageId)) this.emitSessionQueue(sessionId)
  }

  editSessionQueued(projectPath: string, sessionId: string, messageId: string, text: string): void {
    if (!this.deps.store.listProject(projectPath).some(item => item.id === sessionId)) return
    if (this.coordinator.editQueued(sessionId, messageId, text)) this.emitSessionQueue(sessionId)
  }

  setSpeed(agentId: string, speed: 'standard' | 'fast'): void {
    const agent = this.agents.get(agentId)
    if (!agent) return
    agent.speed = speed
    const current = this.assignments.get(agentId)
    if (current) {
      const assignment = this.assignments.set({ ...current, speed })
      this.syncProfileAssignment(assignment)
      this.deps.onAssignmentChanged?.(assignment)
    }
    this.agents.set(agentId, agent)
    this.runners.delete(agentId)
    this.resolved.delete(agentId)
    this.register(agent)
  }

  setProfile(agentId: string, profileName: string): void {
    const agent = this.agents.get(agentId)
    if (!agent) return
    const cfg = loadBsConfig(this.deps.configPath)
    const profile = cfg.agents[profileName]
    if (!profile) return
    agent.name = profileName
    agent.model = profile.provider && profile.model ? `${profile.provider}/${profile.model}` : undefined
    agent.accountId = profile.accountId
    agent.speed = profile.speed ?? 'standard'
    this.agents.set(agentId, agent)
    if (profile.provider && profile.model) {
      const connection = this.deps.providerAccounts?.().find(item => item.providerId === profile.provider)
      if (connection) {
        this.setAgentAssignmentSnapshot({ agentId, providerId: profile.provider, accountId: profile.accountId, modelId: profile.model, speed: agent.speed })
        return
      }
      this.persistAssignment(agentId, profile.provider, profile.model, profile.accountId, agent.speed)
    } else if (profile.provider) {
      const assignment = this.assignments.set({ agentId, profileName, providerId: profile.provider, accountId: profile.accountId, modelId: '', speed: agent.speed, status: 'needs-review' })
      this.syncProfileAssignment(assignment)
      this.deps.onAssignmentChanged?.(assignment)
    }
    this.runners.delete(agentId)
    this.resolved.delete(agentId)
    this.register(agent)
  }

  setAccount(agentId: string, accountId: string | null): void {
    const agent = this.agents.get(agentId)
    if (!agent) return
    agent.accountId = accountId || undefined
    const current = this.assignments.get(agentId)
    if (current) this.persistAssignment(agentId, current.providerId, current.modelId, agent.accountId, current.speed)
    this.agents.set(agentId, agent)
    this.runners.delete(agentId)
    this.resolved.delete(agentId)
    this.register(agent)
  }

  getAgentAssignment(agentId: string): { provider: string; accountId?: string; model: string; speed?: 'standard' | 'fast'; fallback?: Array<{ provider: string; accountId?: string; model: string }> } | null {
    const agent = this.agents.get(agentId)
    if (!agent) return null
    const cfg = loadBsConfig(this.deps.configPath)
    const resolved = this.resolveAgentConfig(cfg, agent.name, agent.model)
    if (!resolved.provider || !resolved.model) return null
    return { provider: resolved.provider, model: resolved.model, accountId: resolved.accountId, speed: agent.speed ?? 'standard', fallback: resolved.fallback }
  }

  getAgentAssignmentSnapshot(agentId: string): AgentAssignmentSnapshot | null {
    return this.assignments.get(agentId) ?? null
  }

  listAgentAssignmentSnapshots(): AgentAssignmentSnapshot[] {
    return Object.values(this.assignments.load())
  }

  revalidateAssignments(): void {
    for (const assignment of Object.values(this.assignments.load())) {
      if (assignment.status !== 'ready') continue
      const connection = this.deps.providerAccounts?.().find(item => item.providerId === assignment.providerId)
      const account = assignment.accountId
        ? connection?.accounts.find(item => item.id === assignment.accountId && item.status === 'active')
        : connection?.accounts.find(item => item.status === 'active' && item.models?.includes(assignment.modelId))
      if (account?.models?.includes(assignment.modelId)) continue
      const next = this.assignments.set({ ...assignment, status: 'error' })
      this.deps.onAssignmentChanged?.(next)
      const agent = this.agents.get(assignment.agentId)
      if (agent) {
        this.runners.delete(agent.id)
        this.resolved.delete(agent.id)
        this.register(agent)
      }
    }
  }

  setAgentAssignmentSnapshot(request: AgentAssignmentSetRequest): AgentAssignmentSnapshot {
    const agent = this.agents.get(request.agentId)
    if (!agent) throw new Error('[bs] Agent không tồn tại')
    const connection = this.deps.providerAccounts?.().find(item => item.providerId === request.providerId)
    const account = request.accountId ? connection?.accounts.find(item => item.id === request.accountId && item.status === 'active') : connection?.accounts.find(item => item.status === 'active')
    const models = account?.models ?? connection?.accounts.filter(item => item.status === 'active').flatMap(item => item.models ?? [])
    if (!connection || (request.accountId && !account) || !models?.includes(request.modelId)) {
      const assignment = this.assignments.set({ ...request, profileName: agent.name, status: 'needs-review' })
      this.syncProfileAssignment(assignment)
      this.deps.onAssignmentChanged?.(assignment)
      return assignment
    }
    agent.model = `${request.providerId}/${request.modelId}`
    agent.accountId = account?.id
    agent.speed = request.speed
    this.agents.set(agent.id, agent)
    const assignment = this.assignments.set({ ...request, profileName: agent.name, accountId: account?.id, status: 'ready' })
    this.syncProfileAssignment(assignment)
    this.runners.delete(agent.id)
    this.resolved.delete(agent.id)
    this.register(agent)
    this.deps.onAssignmentChanged?.(assignment)
    return assignment
  }

  getAgentModel(agentId: string): ModelRef | null {
    const agent = this.agents.get(agentId)
    if (!agent) return null
    const cfg = loadBsConfig(this.deps.configPath)
    const resolved = this.resolveAgentConfig(cfg, agent.name, agent.model)
    if (!resolved.provider || !resolved.model) return null
    return { provider: resolved.provider, model: resolved.model }
  }

  getContextInfo(agentId: string): ContextInfo {
    const agent = this.agents.get(agentId)
    if (!agent) return { limit: null, compactThreshold: null, sessionCost: 0 }
    const cfg = loadBsConfig(this.deps.configPath)
    const resolved = this.resolveAgentConfig(cfg, agent.name, agent.model)
    const modelLimit = resolved.provider && resolved.model
      ? this.modelLimits.get(`${resolved.provider}/${resolved.model}`)
      : undefined
    const limit = modelLimit?.context ?? cfg.maxContextTokens ?? null
    const compactThreshold = cfg.compaction.auto && limit ? limit - cfg.compaction.buffer : null
    return {
      limit,
      compactThreshold,
      sessionCost: this.deps.store.getUsage(this.activeSessionId(agentId)).cost
    }
  }

  getProviderModels(): ModelRef[] {
    const cfg = loadBsConfig(this.deps.configPath)
    const refs: ModelRef[] = []
    const connected = new Set((this.deps.providerAccounts?.() ?? []).map(connection => connection.providerId))
    for (const [provider, p] of Object.entries(cfg.provider)) {
      if (connected.has(provider)) continue
      for (const model of p.models) {
        refs.push({ provider, model })
      }
    }
    for (const connection of this.deps.providerAccounts?.() ?? []) {
      for (const account of connection.accounts) {
        if (account.status !== 'active') continue
        for (const model of account.models ?? []) {
          if (!refs.some(ref => ref.provider === connection.providerId && ref.model === model)) refs.push({ provider: connection.providerId, model })
        }
      }
    }
    return refs
  }

  async getAvailableVariants(agentId: string): Promise<string[]> {
    const agent = this.agents.get(agentId)
    if (!agent || !this.deps.catalog) return []
    return this.allowedVariantsFor(agent)
  }

  getVariant(agentId: string): string | undefined {
    return this.agents.get(agentId)?.variant
  }

  private allowedVariantsFor(agent: AgentConfig): string[] {
    if (!this.deps.catalog) return []
    const cfg = loadBsConfig(this.deps.configPath)
    const resolved = this.resolveAgentConfig(cfg, agent.name, agent.model)
    if (!resolved.provider || !resolved.model) return []
    return Object.keys(this.modelVariants.get(`${resolved.provider}/${resolved.model}`) ?? {})
  }

  async fetchProviderModels(providerId: string): Promise<string[]> {
    if (!this.deps.catalog) return []
    const providers = await this.deps.catalog.fetch()
    return providers[providerId]?.models ?? []
  }

  async listProviderCatalog(): Promise<CatalogProviderSummary[]> {
    if (!this.deps.catalog) return []
    return this.deps.catalog.list()
  }

  async connectProvider(providerId: string, apiKey: string, baseUrl?: string): Promise<BsSettings> {
    const catalog = await this.deps.catalog?.fetch() ?? {}
    const models = catalog[providerId]?.models ?? []
    const settings = this.getSettings()
    // Store the key in the encrypted vault and keep only a keyRef in settings;
    // fall back to plaintext apiKey when safeStorage is unavailable (e.g.
    // Linux without a keyring) so connecting still works.
    let keyRef: string | undefined
    let plainKey = ''
    if (this.deps.vault?.isAvailable()) {
      keyRef = `provider:${providerId}`
      this.deps.vault.saveSecret(keyRef, apiKey)
    } else {
      plainKey = apiKey
    }
    const nextProviders = [
      ...settings.providers.filter(p => p.id !== providerId),
      { id: providerId, apiKey: plainKey, keyRef, baseUrl: baseUrl || catalog[providerId]?.api, models }
    ]
    const defaultProvider = settings.providers.some(p => p.id === settings.defaultProvider)
      ? settings.defaultProvider
      : providerId
    return this.saveSettings({ ...settings, providers: nextProviders, defaultProvider })
  }

  async disconnectProvider(providerId: string): Promise<BsSettings> {
    const settings = this.getSettings()
    this.deps.vault?.deleteSecret(`provider:${providerId}`)
    const nextProviders = settings.providers.filter(p => p.id !== providerId)
    const defaultProvider = nextProviders.some(p => p.id === settings.defaultProvider)
      ? settings.defaultProvider
      : (nextProviders[0]?.id ?? '')
    return this.saveSettings({ ...settings, providers: nextProviders, defaultProvider })
  }

  getSettings(): BsSettings {
    return configToSettings(loadBsConfig(this.deps.configPath))
  }

  getMcpStatus(): McpServerStatus[] {
    return this.mcp.status()
  }

  truncationCleanup(): void {
    this.deps.truncation.cleanup(7)
  }

  listCommands(projectPath: string): Command[] {
    const user = this.deps.commands?.list() ?? []
    return uniqueCommands(user, projectCommands(projectPath))
  }

  saveCommand(command: Command): Command {
    if (!this.deps.commands) throw new Error('commands store unavailable')
    return this.deps.commands.save(command)
  }

  removeCommand(name: string): void {
    if (!this.deps.commands) throw new Error('commands store unavailable')
    this.deps.commands.remove(name)
  }

  async runCommand(agentId: string, name: string, args: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) return
    const all = this.listCommands(agent.cwd)
    const command = all.find(c => c.name === name || `/${c.name}` === name)
    if (!command) {
      this.emit({ type: 'error', agentId, message: `[bs] Không tìm thấy command "${name}".` })
      return
    }
    // System commands act on state (e.g. creating a session) instead of
    // dispatching a prompt to the LLM.
    if (command.type === 'system') {
      if (command.name === 'new') {
        this.newSession(agentId)
        this.emit({ type: 'session-created', agentId })
      }
      return
    }
    const text = await resolveCommand(command, args, { cwd: agent.cwd, commands: all })
    // Keep the raw "/cmd …" input for the UI; the LLM receives the resolved prompt.
    const displayText = args.trim() ? `/${command.name} ${args.trim()}` : `/${command.name}`
    await this.send(agentId, text, undefined, displayText)
  }

  getStats(): StatsSummary {
    const sessions = this.deps.store.listAll()
    const perModel: Record<string, ModelUsage> = {}
    let totalCost = 0
    let totalTokens = 0
    const perSession: Array<{ id: string; title: string; model: string; usage: UsageSummary }> = []
    for (const s of sessions) {
      const model = this.resolved.get(s.agentId)?.model ?? ''
      const u = s.usage
      totalCost += u.cost
      // Provider dashboards count cache-read/write tokens in the input total,
      // so include them here to keep Bs's numbers comparable.
      totalTokens += u.input + u.output + u.cacheRead + u.cacheWrite
      perModel[model] = {
        messages: (perModel[model]?.messages ?? 0) + 1,
        tokens: (perModel[model]?.tokens ?? 0) + u.input + u.output + u.cacheRead + u.cacheWrite,
        cost: (perModel[model]?.cost ?? 0) + u.cost
      }
      perSession.push({ id: s.id, title: s.title, model, usage: u })
    }
    return { totalCost, totalTokens, perModel, perSession }
  }

  async saveSettings(settings: BsSettings): Promise<BsSettings> {
    const current = loadBsConfig(this.deps.configPath)
    const cfg = settingsToConfig(settings, current)
    writeBsConfig(this.deps.configPath, cfg)
    this.deps = { ...this.deps, notifications: cfg.notifications }
    for (const agent of this.agents.values()) {
      const profile = cfg.agents[agent.name]
      if (profile?.provider && profile.model) this.setAgentAssignmentSnapshot({ agentId: agent.id, providerId: profile.provider, accountId: profile.accountId, modelId: profile.model, speed: profile.speed ?? 'standard' })
    }
    await this.reload()
    return configToSettings(cfg)
  }

  async reload(): Promise<void> {
    const agents = [...this.agents.values()]
    for (const id of [...this.runners.keys()]) {
      this.stop(id)
      this.runners.delete(id)
      this.resolved.delete(id)
    }
    await this.syncTools()
    await this.refreshModelLimits()
    this.traceEnabled = loadBsConfig(this.deps.configPath).trace?.enabled ?? false
    for (const agent of agents) this.register(agent)
  }

  async dispose(): Promise<void> {
    if (this.idleCompactTimer) { clearInterval(this.idleCompactTimer); this.idleCompactTimer = null }
    this.stopAll()
    await this.mcp.closeAll()
    this.deps.lsp?.dispose()
  }

  // Runs compaction for agents sitting over the context limit while no turn
  // is in flight. Cheap threshold check first; only then spend an LLM call.
  private async maybeCompactIdle(): Promise<void> {
    const cfg = loadBsConfig(this.deps.configPath)
    for (const agentId of this.runners.keys()) {
      if (this.isRunning(agentId) || this.compacting.has(agentId)) continue
      const now = Date.now()
      const lastAttempt = this.lastCompactionAt.get(agentId) ?? 0
      if (now - lastAttempt < 60_000) continue
      const resolved = this.resolved.get(agentId)
      if (!resolved?.provider || !resolved.model) continue
      const modelLimit = this.modelLimits.get(`${resolved.provider}/${resolved.model}`)
      const limit = modelLimit?.context ?? cfg.maxContextTokens ?? null
      const compaction = cfg.compaction
      if (!compaction?.auto || !limit || limit <= 0) continue
      const used = this.lastUsageByAgent.get(agentId)
      if (!used) continue
      const usedTokens = used.total > 0
        ? used.total
        : used.input + used.output + (used.cacheRead ?? 0) + (used.cacheWrite ?? 0)
      if (usedTokens < limit - compaction.buffer) continue
      const runner = this.runners.get(agentId)
      if (!runner) continue
      this.compacting.add(agentId)
      this.lastCompactionAt.set(agentId, now)
      try {
        await runner.compactIfOverThreshold()
      } catch {
        /* compactIfOverThreshold never throws; safety net only */
      } finally {
        this.compacting.delete(agentId)
      }
    }
  }

  private async refreshModelLimits(): Promise<void> {
    if (!this.deps.catalog) return
    try {
      const providers = await this.deps.catalog.fetch()
      this.modelLimits.clear()
      this.modelVariants.clear()
      for (const [providerId, p] of Object.entries(providers)) {
        for (const model of p.models) {
          const limit = p.limits?.[model]
          if (limit && (limit.context !== undefined || limit.output !== undefined)) {
            this.modelLimits.set(`${providerId}/${model}`, limit)
          }
          const variants = p.variants?.[model]
          if (variants && Object.keys(variants).length > 0) {
            this.modelVariants.set(`${providerId}/${model}`, variants)
          }
        }
      }
    } catch {
      /* offline: fall back to config maxContextTokens */
    }
  }

  private async syncTools(): Promise<void> {
    const cfg = loadBsConfig(this.deps.configPath)
    await this.mcp.connect(cfg.mcp ?? {}, this.deps.projectPath)
    const userTools = await loadUserTools(
      [this.deps.userToolsDir].filter((d): d is string => Boolean(d))
    )
    this.tools = new Map([
      ...this.deps.tools,
      ...userTools.map(t => [t.name, t] as const),
      ...this.mcp.getTools()
    ])
  }

  private register(agent: AgentConfig, force = false): void {
    this.agents.set(agent.id, agent)
    if (agent.background !== undefined) this.backgrounds.set(agent.id, agent.background)
    if (this.runners.has(agent.id)) {
      // Rebuild with freshly synced tools (MCP/user) unless a turn is running.
      if (!force || this.running.has(agent.id)) return
      this.runners.delete(agent.id)
      this.resolved.delete(agent.id)
    }
    const cfg = loadBsConfig(this.deps.configPath)
    const resolved = this.resolveAgentConfig(cfg, agent.name, agent.model)
    this.resolved.set(agent.id, resolved)
    const modelLimit = resolved.provider && resolved.model
      ? this.modelLimits.get(`${resolved.provider}/${resolved.model}`)
      : undefined
    const contextTokens = modelLimit?.context ?? cfg.maxContextTokens
    const skills = collectSkills(agent.cwd, this.deps.userSkillsDir, this.deps.builtinSkillsDir)
    // AGENTS.md/CLAUDE.md walking up from cwd are inlined into the system
    // prompt (opencode-style); module-level ones attach on read via loop.ts.
    const instructionFiles = loadInstructions(agent.cwd)
    const instructions = instructionsText(instructionFiles)
    const llmClient = resolved.accountId && resolved.provider && resolved.model
      ? this.deps.providerRuntime?.(resolved.provider, resolved.accountId, resolved.model) ?? unavailableProviderRuntime(resolved.provider)
      : (this.deps.createLlm ?? createLlm)(resolved.provider, resolved.apiKey ?? '', resolved.baseUrl)
    const resolveSubagent = (type: SubagentType): ResolvedSubagentModel | undefined => {
      const ref = cfg.subagentModels?.[type]
      if (!ref) return undefined
      const subResolved = this.resolveAgentConfig(cfg, agent.name, `${ref.provider}/${ref.model}`)
      if (!subResolved.provider || !subResolved.model) return undefined
      const subLlm = subResolved.accountId
        ? this.deps.providerRuntime?.(subResolved.provider, subResolved.accountId, subResolved.model)
        : subResolved.apiKey ? (this.deps.createLlm ?? createLlm)(subResolved.provider, subResolved.apiKey, subResolved.baseUrl) : undefined
      if (!subLlm) return undefined
      return { provider: subResolved.provider, model: subResolved.model, llm: subLlm }
    }
    const taskTool = createTaskTool({
      llm: llmClient,
      model: resolved.model,
      tools: this.tools,
      resolveSubagent,
      onBackgroundResult: (taskId, text, error) => {
        const sessionId = this.activeSessionId(agent.id)
        this.deps.store.appendMessage(sessionId, {
          id: randomUUID(),
          role: 'assistant',
          text: error
            ? `[subagent ${taskId} failed]\n${error}`
            : `[subagent ${taskId} result]\n${text}`,
          createdAt: Date.now()
        })
        this.emit({
          type: 'subagent-event',
          agentId: agent.id,
          taskId,
          sub: 'done',
          state: error ? 'error' : 'completed',
          result: error ? undefined : text
        })
      }
    })
    const runnerTools = new Map<string, ToolDefinition>([...this.tools])
    runnerTools.set('task', taskTool)
    runnerTools.set('revert', revertTool)
    if (cfg.lsp.enabled && this.deps.lsp) runnerTools.set('lsp', createLspTool(this.deps.lsp))
    const mode = agent.mode ?? 'build'
    this.modes.set(agent.id, mode)
    const modeNote = mode === 'plan'
      ? '\n\nYou are in PLAN MODE: read-only analysis. Do NOT create, edit, or delete files. ' +
        'write/edit/apply-patch/revert/git/todowrite tools are unavailable, and do NOT use the bash tool ' +
        'to modify the filesystem either. Produce a plan or analysis instead.'
      : ''
    const allowed = this.allowedVariantsFor(agent)
    const validVariant =
      agent.variant && allowed.includes(agent.variant) ? agent.variant : undefined
    if (validVariant !== agent.variant) {
      agent.variant = validVariant
      this.agents.set(agent.id, agent)
    }
    const modelKey = `${resolved.provider}/${resolved.model}`
    const variantOptions = validVariant ? this.modelVariants.get(modelKey)?.[validVariant] : undefined
    const runner = new SessionRunner({
      agentId: agent.id,
      turn: 1,
      model: resolved.model,
      system: resolved.systemPrompt + modeNote + instructions + skillListText(skills),
      // Only a shared session compiles prior turns into records, so only it
      // needs to be told what they are. The weakest of the three defences
      // against narrated tool calls, and not relied on alone.
      currentTarget: () => {
        const serving = this.turnTargets.get(this.lifecycleKey(agent.id))?.agentId
        if (!serving || serving === agent.id) return undefined
        return this.runners.get(serving)?.target()
      },
      handoff: (message) => this.handoff(agent.id, message),
      systemSuffix: () => this.executionForAgent(agent.id)
        ? SHARED_SESSION_RECORD_NOTE
        : '',
      systemInstructionPaths: new Set(instructionFiles.map(f => f.path)),
      cwd: agent.cwd,
      llm: llmClient,
      tools: runnerTools,
      decidePermission: (tool, input) => decidePermission(
        this.modes.get(agent.id) ?? 'build',
        cfg.permission,
        (t) => this.deps.savedPermissions.isAllowed(agent.cwd, t),
        tool,
        input
      ),
      ask: (promptId, tool) => this.awaitPrompt(agent.id, promptId, tool),
      maxSteps: cfg.maxSteps,
      maxContextTokens: contextTokens,
      compaction: cfg.compaction,
      toolOutput: cfg.toolOutput,
      truncation: this.deps.truncation,
      replaceItems: (items) => this.deps.store.replaceItems(this.activeSessionId(agent.id), items),
      snapshots: this.deps.snapshots,
      snapshotScopeId: () => this.lifecycleKey(agent.id),
      onEvent: (e) => {
        this.emit(e)
        // Fire and forget: a title must never delay or fail a turn.
        if (e.type === 'done') void this.maybeTitleSession(agent.id, llmClient, resolved.model)
      },
      onArtifact: (entry) => this.deps.onArtifact?.(entry),
      getItems: () => this.deps.store.get(this.activeSessionId(agent.id))?.items ?? [],
      buildMessages: (items) => {
        // After a handover the active turn carries the previous provider's tool
        // call ids and thoughtSignature, which the next provider refuses. The
        // neutral compilation already strips exactly those.
        const servingOther = this.turnTargets.get(this.lifecycleKey(agent.id))?.agentId
        if (servingOther && servingOther !== agent.id) {
          return compileNeutralContext(items, { toolOutputMaxChars: cfg.compaction.toolOutputMaxChars })
        }
        const current = this.executionForAgent(agent.id)?.execution
        if (!current) return toLlmMessages(items, { toolOutputMaxChars: cfg.compaction.toolOutputMaxChars })
        const turnId = current.turnId
        const prior = items.filter(item => (item.kind === 'message' ? item.message.turnId : item.tool.turnId) !== turnId)
        const active = items.filter(item => (item.kind === 'message' ? item.message.turnId : item.tool.turnId) === turnId)
        return [
          ...compileNeutralContext(prior, { toolOutputMaxChars: cfg.compaction.toolOutputMaxChars }),
          ...toLlmMessages(active, { toolOutputMaxChars: cfg.compaction.toolOutputMaxChars })
        ]
      },
      appendMessage: (msg) => {
        const execution = this.executionForAgent(agent.id)?.execution
        this.deps.store.appendMessage(this.activeSessionId(agent.id), execution
          ? { ...msg, turnId: execution.turnId, execution }
          : msg)
        // The format belongs to shared-session compilation, so the manager is
        // the right place to notice it coming back out of the model.
        if (msg.role === 'assistant' && looksLikeNarratedToolCall(msg.text)) {
          this.emit({ type: 'narrated-tool-call', agentId: agent.id })
        }
      },
      appendTool: (tool) => {
        const execution = this.executionForAgent(agent.id)?.execution
        this.deps.store.appendTool(this.activeSessionId(agent.id), execution
          ? { ...tool, turnId: execution.turnId, execution }
          : tool)
      },
      takeSteers: () => {
        const q = this.queues.get(agent.id)
        if (!q || q.length === 0) return []
        this.queues.delete(agent.id)
        this.emitQueue(agent.id)
        return q
      },
      setTodos: (todos) => {
        this.deps.store.setTodos(this.activeSessionId(agent.id), todos)
        this.emit({ type: 'todo-updated', agentId: agent.id, todos })
      },
      variantOptions,
      serviceTier: agent.speed === 'fast' ? 'priority' : undefined,
      diagnostics: cfg.lsp.enabled && this.deps.lsp
        ? (filePath, text) => this.deps.lsp!.diagnosticsText(filePath, text)
        : undefined,
      computeCost: (tokens) => calcCost({
        input: tokens.input,
        output: tokens.output,
        cacheRead: tokens.cacheRead ?? 0,
        cacheWrite: tokens.cacheWrite ?? 0
      }, this.priceFor(resolved.provider, resolved.model)),
      onUsage: (tokens) => {
        const price = this.priceFor(resolved.provider, resolved.model)
        const sessionId = this.activeSessionId(agent.id)
        const usage: UsageSummary = {
          input: tokens.input,
          output: tokens.output,
          cacheRead: tokens.cacheRead ?? 0,
          cacheWrite: tokens.cacheWrite ?? 0,
          cost: calcCost({
            input: tokens.input,
            output: tokens.output,
            cacheRead: tokens.cacheRead ?? 0,
            cacheWrite: tokens.cacheWrite ?? 0
          }, price)
        }
        this.lastUsageByAgent.set(agent.id, tokens)
        const executionContext = this.executionForAgent(agent.id)
        if (executionContext) {
          executionContext.usage = {
            input: executionContext.usage.input + usage.input,
            output: executionContext.usage.output + usage.output,
            cacheRead: executionContext.usage.cacheRead + usage.cacheRead,
            cacheWrite: executionContext.usage.cacheWrite + usage.cacheWrite,
            cost: executionContext.usage.cost + usage.cost
          }
        } else {
          this.deps.store.addUsage(sessionId, usage)
        }
        const sessionUsage = this.deps.store.getUsage(sessionId)
        const pendingUsage = executionContext?.usage ?? EMPTY_USAGE
        this.emit({
          type: 'usage',
          agentId: agent.id,
          tokens,
          sessionCost: sessionUsage.cost + pendingUsage.cost,
          // "in" counts cached tokens too, matching provider dashboards (e.g.
          // DeepSeek's prompt_tokens = cache hit + miss).
          sessionTokens: {
            input: sessionUsage.input + sessionUsage.cacheRead + sessionUsage.cacheWrite + pendingUsage.input + pendingUsage.cacheRead + pendingUsage.cacheWrite,
            output: sessionUsage.output + pendingUsage.output
          }
        })
      }
    })
    this.runners.set(agent.id, runner)
  }

  private resolveAgentConfig(cfg: BsConfig, agentName: string, agentModel?: string): ResolvedAgentConfig {
    cfg = this.materializeConnectedProviders(cfg)
    const registeredAgent = [...this.agents.values()].find(a => a.name === agentName)
    const storedAssignment = registeredAgent ? this.assignments.get(registeredAgent.id) : undefined
    const requestedModel = storedAssignment?.status === 'ready' && storedAssignment.providerId && storedAssignment.modelId
      ? `${storedAssignment.providerId}/${storedAssignment.modelId}`
      : agentModel
    const resolved = resolveAgentConfig(
      cfg,
      agentName,
      this.deps.env,
      requestedModel,
      this.deps.vault ? (ref: string) => this.deps.vault!.getSecret(ref) : undefined
    )
    if (storedAssignment && storedAssignment.status !== 'ready') {
      return { ...resolved, provider: storedAssignment.providerId, model: '', accountId: undefined, apiKey: null }
    }
    const agent = registeredAgent
    if (storedAssignment?.status === 'ready') resolved.accountId = storedAssignment.accountId
    if (agent?.accountId) resolved.accountId = agent.accountId
    if (resolved.provider) {
      const connection = this.deps.providerAccounts?.().find(c => c.providerId === resolved.provider)
      if (resolved.accountId) {
        const selected = connection?.accounts.find(account => account.id === resolved.accountId && account.status === 'active' && account.models?.includes(resolved.model))
        if (!selected) {
          resolved.model = ''
          resolved.accountId = undefined
        }
      } else {
        const active = connection?.accounts.find(account => account.status === 'active' && account.models?.includes(resolved.model))
        if (active) resolved.accountId = active.id
      }
    }
    return resolved
  }

  private persistAssignment(agentId: string, providerId: string, modelId: string, accountId?: string, speed: 'standard' | 'fast' = 'standard'): void {
    const assignment = this.assignments.set({ agentId, profileName: this.agents.get(agentId)?.name, providerId, modelId, accountId, speed, status: 'ready' })
    this.syncProfileAssignment(assignment)
    this.deps.onAssignmentChanged?.(assignment)
  }

  private syncProfileAssignment(assignment: AgentAssignmentSnapshot): void {
    const profileName = assignment.profileName ?? this.agents.get(assignment.agentId)?.name
    if (!profileName) return
    const cfg = loadBsConfig(this.deps.configPath)
    const profile = cfg.agents[profileName]
    if (!profile) return
    cfg.agents[profileName] = {
      ...profile,
      provider: assignment.providerId || undefined,
      model: assignment.modelId || undefined,
      accountId: assignment.accountId,
      speed: assignment.speed
    }
    writeBsConfig(this.deps.configPath, cfg)
  }

  private materializeConnectedProviders(cfg: BsConfig): BsConfig {
    const nextProviders = { ...cfg.provider }
    for (const connection of this.deps.providerAccounts?.() ?? []) {
      const activeModels = connection.accounts.filter(account => account.status === 'active').flatMap(account => account.models ?? [])
      if (activeModels.length === 0) continue
      const current = nextProviders[connection.providerId]
      nextProviders[connection.providerId] = { ...(current ?? {}), models: [...new Set([...(current?.models ?? []), ...activeModels])] }
    }
    return { ...cfg, provider: nextProviders }
  }

  private priceFor(provider: string, model: string): ModelPrice | undefined {
    const p = this.deps.prices?.[`${provider}/${model}`]
    if (!p) return undefined
    return { input: p.input ?? 0, output: p.output ?? 0, cacheRead: p.cacheRead, cacheWrite: p.cacheWrite }
  }

  private awaitPrompt(agentId: string, promptId: string, tool?: string): Promise<PromptResponse | null> {
    return new Promise(resolve => {
      this.pendingPrompts.set(promptId, { agentId, tool, resolve })
      const turnId = this.executionForAgent(agentId)?.execution.turnId
      if (turnId) this.coordinator.setPrompt(turnId, promptId)
      if (this.controllers.get(this.lifecycleKey(agentId))?.signal.aborted) {
        this.pendingPrompts.delete(promptId)
        resolve(null)
      }
      if (this.deps.notifications?.needsInput !== false) {
        this.deps.notify?.notify({
          title: '[bs] Cần bạn nhập',
          body: `${this.agents.get(agentId)?.name ?? agentId} đang chờ...`,
          agentId,
          onActivate: () => this.deps.onActivateAgent?.(agentId)
        })
      }
    })
  }

  private resolvePendingFor(agentId: string, resp: PromptResponse | null): void {
    for (const [id, entry] of this.pendingPrompts) {
      if (entry.agentId !== agentId) continue
      entry.resolve(resp)
      this.pendingPrompts.delete(id)
    }
  }

  private nextTurn(agentId: string): number {
    const sessionId = this.activeSessionId(agentId)
    const next = (this.turnCounters.get(sessionId) ?? 0) + 1
    this.turnCounters.set(sessionId, next)
    return next
  }

  private writeTrace(e: ChatEvent): void {
    const trace = this.deps.trace
    if (!trace) return
    const agentId = e.agentId
    const sessionId = this.activeSessionId(agentId)
    const turn = this.turnCounters.get(sessionId) ?? 0
    const emitTrace = (ev: TraceEventInput) => {
      const full = trace.append(sessionId, ev)
      this.deps.onTrace?.(full)
      return full
    }
    // text/reasoning deltas accumulate into one assistant message; flush it
    // at the next event boundary so the trace shows full content, not one
    // row per streamed delta (and far fewer writes -> less UI churn).
    const flushMessage = () => {
      const pending = this.pendingMessages.get(sessionId)
      if (!pending || (!pending.text && !pending.reasoning)) return
      emitTrace({
        type: 'message', agentId, sessionId, turn: pending.turn, role: 'assistant',
        text: pending.text || undefined,
        reasoning: pending.reasoning || undefined,
        tokens: pending.tokens
      })
      this.pendingMessages.delete(sessionId)
    }
    switch (e.type) {
      case 'turn-started':
        // counter already incremented before emit (see runTurn)
        this.pendingMessages.delete(sessionId)
        emitTrace({ type: 'turn-started', agentId, sessionId, turn: this.turnCounters.get(sessionId) ?? 1 })
        break
      case 'text-delta': {
        const pending = this.pendingMessages.get(sessionId) ?? { turn, text: '', reasoning: '' }
        pending.text += e.delta
        pending.turn = turn
        this.pendingMessages.set(sessionId, pending)
        break
      }
      case 'reasoning-delta': {
        const pending = this.pendingMessages.get(sessionId) ?? { turn, text: '', reasoning: '' }
        pending.reasoning += e.delta
        pending.turn = turn
        this.pendingMessages.set(sessionId, pending)
        break
      }
      case 'usage': {
        const pending = this.pendingMessages.get(sessionId)
        if (pending) pending.tokens = e.tokens
        break
      }
      case 'tool-start':
        flushMessage()
        this.toolStartTs.set(e.call.id, Date.now())
        emitTrace({ type: 'tool-start', agentId, sessionId, turn, callId: e.call.id, tool: e.call.tool, input: e.call.input })
        break
      case 'tool-result': {
        const startTs = this.toolStartTs.get(e.call.id)
        const durationMs = startTs !== undefined ? Date.now() - startTs : 0
        this.toolStartTs.delete(e.call.id)
        emitTrace({ type: 'tool-result', agentId, sessionId, turn, callId: e.call.id, tool: e.call.tool, output: e.call.output, error: e.call.error, durationMs, cost: undefined })
        break
      }
      case 'subagent-event':
        flushMessage()
        emitTrace({
          type: 'subagent', agentId, sessionId, turn, taskId: e.taskId, parentTaskId: e.parentTaskId,
          subagentType: e.subagentType,
          state: e.sub === 'done' ? (e.state ?? 'completed') : 'running',
          text: e.sub === 'delta' ? e.text : undefined,
          result: e.result, tools: []
        })
        break
      case 'compacted':
        flushMessage()
        emitTrace({ type: 'compaction', agentId, sessionId, turn, summary: e.summary })
        break
      case 'error':
        flushMessage()
        emitTrace({ type: 'error', agentId, sessionId, message: e.message })
        break
      case 'done':
        flushMessage()
        emitTrace({ type: 'done', agentId, sessionId, reason: e.reason, tokens: e.tokens, cost: e.cost })
        this.deps.trace?.flush(sessionId)
        break
      default:
        break
    }
  }

  // Called by the loop when a step failed and overflow recovery declined. Only
  // a quota or capacity refusal is worth moving: repeating a malformed or
  // unauthorised request elsewhere just fails again.
  private async handoff(agentId: string, message: string): Promise<boolean> {
    const kind = classifyRuntimeError(message).kind
    if (kind !== 'quota-exhausted' && kind !== 'capacity-exhausted') return false
    const key = this.lifecycleKey(agentId)
    const state = this.turnTargets.get(key) ?? { agentId, tried: new Set([agentId]) }
    const from = this.candidateFor(state.agentId)
    if (!from) return false
    const candidates = [...this.agents.values()]
      .filter(agent => agent.kind !== 'pty' && agent.cwd === this.agents.get(agentId)?.cwd)
      .flatMap(agent => { const c = this.candidateFor(agent.id); return c ? [c] : [] })
    const ranked = rankFallbackAgents({ from, candidates, isPoolSpent: c => this.isPoolSpent(c) })
      .filter(candidate => !state.tried.has(candidate.agentId))
    const next = ranked[0]
    if (!next) return false
    state.agentId = next.agentId
    state.tried.add(next.agentId)
    this.turnTargets.set(key, state)
    this.emit({
      type: 'agent-fallback',
      agentId,
      toAgentId: next.agentId,
      toAgentName: this.agents.get(next.agentId)?.name ?? next.agentId,
      reason: kind === 'capacity-exhausted' ? 'Capacity exhausted' : 'Quota exhausted',
      // Named because two agents on different models can share one pool, and
      // without it the choice reads as arbitrary.
      pool: this.poolOf(from)
    })
    return true
  }

  private candidateFor(agentId: string): FallbackCandidate | undefined {
    // An assignment gates the agent when it has one, but an agent configured
    // by API key has none and is still a valid candidate. The resolved config
    // is what every path ends at.
    const assignment = this.assignments.get(agentId)
    if (assignment && assignment.status !== 'ready') return undefined
    const resolved = this.resolved.get(agentId)
    if (!resolved?.provider || !resolved.model) return undefined
    return { agentId, providerId: resolved.provider, modelId: resolved.model, accountId: resolved.accountId }
  }

  private poolOf(candidate: FallbackCandidate): string | undefined {
    return this.deps.quotaGroupForModel?.(candidate.providerId, candidate.modelId)
  }

  // A pool the provider already reports as spent rules out every agent drawing
  // on it, which is not the same as ruling out one model.
  private isPoolSpent(candidate: FallbackCandidate): boolean {
    const pool = this.poolOf(candidate)
    if (!pool || !candidate.accountId) return false
    const account = this.deps.providerAccounts?.()
      .find(connection => connection.providerId === candidate.providerId)
      ?.accounts.find(item => item.id === candidate.accountId)
    const group = account?.usage?.quotaGroups?.find(item => item.id === pool)
    if (!group) return false
    return poolState(group, account?.poolErrors) !== 'ok'
  }

  private emit(e: ChatEvent): void {
    const context = this.executionForAgent(e.agentId)
    if (!context) {
      this.onEvent(e)
      return
    }
    if (e.type === 'error') context.execution.status = 'failed'
    if (e.type === 'done') context.execution.status = e.reason === 'stopped' ? 'stopped' : 'completed'
    const scoped: ChatEvent = {
      ...e,
      projectPath: context.projectPath,
      sessionId: context.sessionId,
      turnId: context.execution.turnId
    }
    this.onEvent(scoped)
  }

  private executionForAgent(agentId: string) {
    return [...this.sessionExecutions.values()].find(context => context.execution.agentId === agentId)
  }

  private lifecycleKey(agentId: string): string {
    return this.executionForAgent(agentId)?.sessionId ?? agentId
  }
}
