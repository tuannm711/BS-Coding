import type { ProviderModel, ProviderModelCapabilities } from './providers'

export type AgentStatus = 'spawning' | 'running' | 'idle' | 'exited' | 'stopped' | 'error'
export type AlertLevel = 'normal' | 'attention' | 'error'
export type AgentKind = 'pty' | 'native'
export type AgentMode = 'build' | 'plan' | 'coordinate'
export type ModelVariant = string
export type AgentSpeed = 'standard' | 'fast'
export type ChatRole = 'user' | 'assistant'

export const CHAT_SESSION_SCHEMA_VERSION = 2 as const
export type TurnExecutionStatus = 'running' | 'completed' | 'stopped' | 'failed'

export interface TurnExecutionSnapshot {
  turnId: string
  agentId: string
  agentName: string
  providerId?: string
  accountId?: string
  accountLabel?: string
  modelId?: string
  modelLabel?: string
  speed: AgentSpeed
  startedAt: number
  completedAt?: number
  status: TurnExecutionStatus
}

export type ResolvedTurnExecutionSnapshot = TurnExecutionSnapshot &
  Required<Pick<TurnExecutionSnapshot, 'providerId' | 'modelId'>>

export interface Template {
  id: string
  name: string
  command: string
  args: string[]
  icon?: string
  kind?: AgentKind
}

export interface AgentConfig {
  id: string
  name: string
  templateId: string
  cwd: string
  kind?: AgentKind
  mode?: AgentMode
  variant?: ModelVariant
  speed?: AgentSpeed
  model?: string
  accountId?: string
  background?: boolean
}

export interface Workspace {
  projectPath: string
  name: string
  agents: AgentConfig[]
}

export interface WorkspaceSummary {
  projectPath: string
  name: string
  agentCount: number
}

export interface GitStatus {
  branch: string | null
  dirtyCount: number
}

export interface AgentState {
  agentId: string
  status: AgentStatus
  exitCode: number | null
  lastOutputAt: number | null
  alert: AlertLevel
}

export interface WorkspaceRuntime {
  workspace: Workspace
  agents: AgentState[]
  git: GitStatus | null
}

export interface NewAgentInput {
  name: string
  templateId: string
  cwd: string
  kind?: AgentKind
  mode?: AgentMode
}

export interface MessageTokens {
  input: number
  output: number
  total: number
  reasoning?: number
  cacheRead?: number
  cacheWrite?: number
}

export interface ContextInfo {
  limit: number | null
  compactThreshold: number | null
  sessionCost: number
}

export interface ImageAttachment {
  id: string
  name: string
  mimeType: string
  dataUrl: string
  size: number
  width?: number
  height?: number
}

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  // Raw user input when `text` was resolved before sending (e.g. a slash
  // command expanded into its template); the UI shows this instead of `text`.
  displayText?: string
  reasoning?: string
  tokens?: MessageTokens
  images?: ImageAttachment[]
  turnId?: string
  execution?: TurnExecutionSnapshot
  createdAt: number
}

export interface ToolCallData {
  id: string
  tool: string
  input: Record<string, unknown>
  thoughtSignature?: string
  turnId?: string
  execution?: TurnExecutionSnapshot
  output?: string
  error?: string
  permission: 'pending' | 'allowed' | 'denied'
}

export type ChatTranscriptItem =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'tool'; tool: ToolCallData }

export interface SessionSummary {
  id: string
  agentId: string
  title: string
  messageCount: number
  createdAt: number
  updatedAt: number
}

export type ProjectSessionSummary = Omit<SessionSummary, 'agentId'> & {
  projectPath: string
  lastAgentId?: string
  // A turn is running in this session right now. Derived from the turn's bound
  // session, so it stays true no matter which session the user is looking at.
  running?: boolean
  // Where the session's work comes from. A session becomes 'coordination' when
  // a coordinator dispatched a task into it; everything else is ordinary work.
  // Stored rather than re-derived on each read, so two places cannot disagree.
  kind?: 'work' | 'coordination'
}

/**
 * BsAgentManager.emit stamps the session scope onto every event raised during
 * a project turn. Declaring it here is what lets the renderer read those
 * fields; they used to be carried across the boundary by a pair of casts.
 */
/** One task a coordinator assigned, while it runs and after it finishes. */
export interface CoordinationAssignment {
  id: string
  coordinatorId: string
  turnId?: string
  workerId: string
  workerName: string
  // The session the task actually ran in, so the coordination view can render
  // that worker's live chat rather than a summary of it. Sessions are one
  // store keyed by cwd — a worker's session is a session of this project — so
  // this needs no new lookup, only recording which one it was.
  sessionId: string
  task: string
  startedAt: number
  finishedAt?: number
  // 'no-result' is not 'failed'. A worker that ran, used tools and ended
  // without writing a reply has done something; calling that a failure hid the
  // one case worth reading — and reading it meant opening the worker's own
  // session, which is what this record exists to spare.
  state: 'running' | 'completed' | 'failed' | 'no-result'
  result?: string
  // What the turn actually did, so the board can say "2 tools, last: skill"
  // instead of a bare state chip.
  toolNames?: string[]
}

export type ChatEvent = Partial<Omit<ChatEventScope, 'agentId'>> & (
  | { type: 'text-delta'; agentId: string; delta: string }
  | { type: 'reasoning-delta'; agentId: string; delta: string }
  | { type: 'tool-start'; agentId: string; call: ToolCallData }
  | { type: 'tool-result'; agentId: string; call: ToolCallData }
  | { type: 'prompt-request'; agentId: string; promptId: string
      kind: 'permission' | 'question'; call?: ToolCallData; question?: string
      options?: QuestionOption[]; multiple?: boolean; custom?: boolean }
  | { type: 'turn-started'; agentId: string }
  | { type: 'done'; agentId: string; reason: string; tokens?: TokenUsage; cost?: number }
  | { type: 'error'; agentId: string; message: string }
  | { type: 'compacted'; agentId: string; summary: string }
  | { type: 'compaction-failed'; agentId: string }
  | { type: 'narrated-tool-call'; agentId: string }
  | { type: 'agent-fallback'; agentId: string; toAgentId: string; toAgentName: string; reason: string; pool?: string }
  | { type: 'assignment-started'; agentId: string; assignment: CoordinationAssignment }
  | { type: 'assignment-finished'; agentId: string; assignment: CoordinationAssignment }
  | { type: 'usage'; agentId: string; tokens: MessageTokens; sessionCost: number; sessionTokens: { input: number; output: number } }
  | { type: 'todo-updated'; agentId: string; todos: TodoItem[] }
  | { type: 'queue-updated'; agentId: string; queue: QueuedMessage[] }
  | { type: 'subagent-event'; agentId: string; taskId: string
      parentTaskId?: string
      sub: 'start' | 'delta' | 'tool' | 'done'
      subagentType?: string; text?: string; tool?: string
      reasoning?: string; background?: boolean; result?: string
      state?: 'running' | 'completed' | 'cancelled' | 'error' }
  | { type: 'user-message'; agentId: string; message: ChatMessage }
  | { type: 'message-removed'; agentId: string; messageId: string }
  | { type: 'session-created'; agentId: string }
)

export interface ChatEventScope {
  projectPath: string
  sessionId: string
  agentId: string
  turnId?: string
}

export type ScopedChatEvent = ChatEvent & ChatEventScope

export interface QueuedMessage {
  id: string
  text: string
  displayText?: string
  images?: ImageAttachment[]
  // Delegated by a coordinator. Steering is something a person does while
  // watching an agent work; a coordinator is not watching, it is waiting for a
  // result it will act on, so this runs as its own turn rather than being
  // folded into whatever the worker is already doing.
  assigned?: boolean
}

export type SessionQueuedMessage = QueuedMessage & { agentId: string }

export interface TokenUsage {
  input: number
  output: number
  total: number
}

export interface TraceSummary {
  sessionId: string
  eventCount: number
  firstTs: number
  lastTs: number
}

export type TraceEvent =
  | { type: 'turn-started'; seq: number; ts: number; agentId: string; sessionId: string; turn: number }
  | { type: 'message'; seq: number; ts: number; agentId: string; sessionId: string; turn: number; role: 'assistant'; text?: string; reasoning?: string; tokens?: MessageTokens; ttftMs?: number; decodeMs?: number; durationMs?: number }
  | { type: 'tool-start'; seq: number; ts: number; agentId: string; sessionId: string; turn: number; callId: string; tool: string; input: Record<string, unknown> }
  | { type: 'tool-result'; seq: number; ts: number; agentId: string; sessionId: string; turn: number; callId: string; tool: string; output?: string; error?: string; durationMs: number; cost?: number }
  | { type: 'subagent'; seq: number; ts: number; agentId: string; sessionId: string; turn: number; taskId: string; parentTaskId?: string; subagentType?: string; state: 'running' | 'completed' | 'cancelled' | 'error'; text?: string; result?: string; tools: string[] }
  | { type: 'compaction'; seq: number; ts: number; agentId: string; sessionId: string; turn: number; summary: string }
  | { type: 'error'; seq: number; ts: number; agentId: string; sessionId: string; message: string }
  | { type: 'done'; seq: number; ts: number; agentId: string; sessionId: string; reason: string; tokens?: TokenUsage; cost?: number }
  | { type: 'pty-run'; seq: number; ts: number; agentId: string; sessionId: string; startTs: number; endTs?: number; exitCode?: number; durationMs?: number; logPath: string }

export interface QuestionOption {
  label: string
  description?: string
}

export interface QuestionPrompt {
  question: string
  header?: string
  options?: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TodoPriority = 'high' | 'medium' | 'low'

export interface TodoItem {
  content: string
  status: TodoStatus
  priority?: TodoPriority
}

export interface PromptResponse {
  allow: boolean
  text?: string
  always?: boolean
}

export interface ProviderSettings {
  id: string
  apiKey: string
  /** Reference into the encrypted vault; prefer over apiKey. */
  keyRef?: string
  baseUrl?: string
  models: string[]
}

export type AccountStatus = 'active' | 'disabled' | 'expired' | 'error'
export type AuthMode = 'api-key' | 'oauth' | 'imported'
export type ProviderErrorKind = 'auth' | 'quota-exhausted' | 'capacity-exhausted' | 'runtime-entity-not-found' | 'unavailable' | 'invalid-request' | 'context-overflow' | 'unknown'
export interface ProviderErrorState {
  kind: ProviderErrorKind
  message: string
  statusCode?: number
  retryAt?: number
  updatedAt: number
}
export type ProviderRefreshStageStatus = 'idle' | 'refreshing' | 'ready' | 'error' | 'unavailable'
export interface ProviderRefreshStages {
  credentials: ProviderRefreshStageStatus
  models: ProviderRefreshStageStatus
  usage: ProviderRefreshStageStatus
}

/** Safe account metadata; secrets stay in the main-process vault. */
export interface ProviderAccount {
  id: string
  providerId: string
  label: string
  authMode: AuthMode
  status: AccountStatus
  profile?: { email?: string; name?: string; planName?: string }
  createdAt: number
  lastUsedAt: number
  oauthExpiresAt?: number
  keyRef?: string
  capabilities?: ProviderModelCapabilities
  models?: string[]
  modelCatalog?: ProviderModel[]
  refreshStages?: ProviderRefreshStages
  lastError?: string
  providerError?: ProviderErrorState
  /**
   * Quota errors, keyed by the pool that was refused. Separate from
   * providerError because an exhausted pool is a fact about one family of
   * models, while an expired token is a fact about the account. Folding them
   * together lets a second exhausted pool overwrite the first, and routing
   * needs to know about both.
   */
  poolErrors?: Record<string, ProviderErrorState>
  usage?: ProviderUsage
}

export interface ProviderQuotaWindow {
  id: string
  // Short enough to sit on one line beside a countdown and a percentage —
  // 'Weekly', '5-hour'. The provider's sentence about the window goes in
  // `description`; a label that is a paragraph is not a label.
  label: string
  description?: string
  kind: 'session' | 'weekly' | 'monthly' | 'additional' | 'unknown'
  remainingPercent?: number
  resetAt?: number
  windowMinutes?: number
  usageKnown: boolean
  source: 'provider' | 'legacy-provider'
}

export interface ProviderQuotaGroup {
  id: string
  label: string
  modelIds: string[]
  windows: ProviderQuotaWindow[]
}

export interface ProviderTrackedUsage {
  periodKey: string
  periodStart: number
  periodEnd?: number
  requests: number
  tokensInput: number
  tokensCache: number
  tokensOutput: number
  estimatedBilled: number
  source: 'bs-tracked'
}

export interface ProviderUsage {
  accountId: string
  accountLabel?: string
  accountType?: 'oauth' | 'api-key' | 'session'
  periodStart?: number
  periodEnd?: number
  resetAt?: number
  secondaryResetAt?: number
  requestsUsed?: number
  requestLimit?: number
  tokensUsed?: number
  tokenLimit?: number
  /**
   * ChatGPT rate-limit reset credits. `applicable` is lower than `available`
   * when a credit is held but cannot be spent right now — observed when the
   * window it would reset had no usage. Absent when the provider has no such
   * concept; do not default it to zero.
   */
  resetCredits?: { available: number; applicable: number }
  primaryUsedPercent?: number
  secondaryUsedPercent?: number
  modelQuotas?: Record<string, { remainingPercent: number; resetAt?: number }>
  tokensInput?: number
  tokensOutput?: number
  estimatedBilled?: number
  planName?: string
  subscriptionExpiresAt?: number
  quotaGroups?: ProviderQuotaGroup[]
  tracked?: ProviderTrackedUsage
  lastSuccessfulRefreshAt?: number
  stale?: boolean
  refreshError?: string
  refreshedAt: number
  source: 'provider' | 'internal' | 'unavailable'
  status: 'ok' | 'unavailable'
  /** Why the last refresh degraded — not why usage is unavailable. */
  statusReason?: string
}

export interface ProviderConnection {
  providerId: string
  accounts: ProviderAccount[]
  activeAccountId: string | null
}

export interface AgentModelAssignment {
  provider: string
  accountId?: string
  model: string
  speed?: AgentSpeed
}

export type PermissionRule = 'allow' | 'ask' | 'deny'

export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

export interface CompactionSettings {
  auto: boolean
  buffer: number
  keepTokens: number
  tailTurns: number
  toolOutputMaxChars: number
  prune?: boolean
}

export interface ToolOutputSettings {
  maxBytes: number
  maxLines: number
}

export interface LspSettings {
  enabled: boolean
  diagnosticsTimeoutMs: number
}

export interface AgentSettings {
  name: string
  systemPrompt: string
  provider?: string
  model?: string
  accountId?: string
  speed?: AgentSpeed
}

export interface BsSettings {
  providers: ProviderSettings[]
  defaultProvider: string
  agents: AgentSettings[]
  permission: Record<string, PermissionRule>
  mcp: Record<string, McpServerConfig>
  maxContextTokens: number
  maxSteps: number
  compaction: CompactionSettings
  toolOutput: ToolOutputSettings
  lsp: LspSettings
  notifications?: NotificationsSettings
  trace?: { enabled: boolean }
  /** Model override per sub-agent role. Missing role -> inherit main agent model. */
  subagentModels?: Partial<Record<SubagentType, ModelRef>>
}

export type SubagentType = 'research' | 'general' | 'reviewer'

export interface ModelRef {
  provider: string
  model: string
}

export interface CatalogProviderSummary {
  id: string
  name: string
  api?: string
  modelCount: number
}

export interface McpServerStatus {
  name: string
  status: 'connected' | 'error'
  error?: string
  tools: string[]
}

export interface Command {
  name: string
  description: string
  template: string
  type?: 'prompt' | 'system'
  agent?: string
  model?: string
}

export interface UsageSummary {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
}

export interface ModelUsage {
  messages: number
  tokens: number
  cost: number
}

export interface StatsSummary {
  totalCost: number
  totalTokens: number
  perModel: Record<string, ModelUsage>
  perSession: Array<{ id: string; title: string; model: string; usage: UsageSummary }>
}

export interface ContextChangedEvent {
  projectPath: string
  files: string[]
}

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface ArtifactEntry {
  id: string
  path: string
  absPath: string
  kind: 'create' | 'edit'
  agentId: string
  agentName: string
  ts: number
}

export type UpdaterStatusEvent =
  | { type: 'checking' }
  | { type: 'update-available'; version: string; releaseNotes?: string; releaseDate?: string; currentVersion: string }
  | { type: 'up-to-date'; currentVersion: string }
  | { type: 'download-progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }
  | { type: 'not-supported'; message: string }

export type BackgroundState = 'foreground' | 'background'

export interface FileSuggestion {
  path: string
  name: string
  isDirectory: boolean
}

export interface FileViewerPayload {
  /** raw path from chat (relative or absolute) */
  path: string
  /** agent cwd used to resolve relative paths */
  root: string
}

export interface FileContentResult {
  path: string
  ext: string
  content: string
}

export interface NotificationsSettings {
  needsInput: boolean
  onDone: boolean
}

export interface TerminalInfo {
  id: string        // "term-<uuid>"
  cwd: string
  name: string      // basename(cwd), tiêu đề pane
  status: 'running' | 'exited'
}
