import type { CoordinationAssignment,
  AgentConfig, AgentMode, AgentModelAssignment, AgentState, ArtifactEntry, CatalogProviderSummary, ChatEvent, ChatMessage, ChatTranscriptItem, Command,
  ContextChangedEvent, ContextInfo, DirEntry, FileContentResult, FileSuggestion, FileViewerPayload,
  GitStatus, ImageAttachment, McpServerStatus, BsSettings, ModelRef, NewAgentInput, PromptResponse,
  ProjectSessionSummary, ProviderAccount, ProviderConnection, ProviderUsage, SessionSummary, StatsSummary, Template, TerminalInfo, TodoItem, TraceEvent, TraceSummary, UpdaterStatusEvent, UsageSummary, WorkspaceRuntime, WorkspaceSummary
} from './types'
import type { ConsumeResetCreditResult } from './reset-credit'
import type { BrowserStatusInfo, PairingInfo } from './browser-types'
import type { AgentAssignmentSetRequest, AgentAssignmentSnapshot } from './provider-state'
import type { ProviderSnapshot } from './provider-state'
import type { RemoteStatus } from './remote-types'
import type {
  ProviderAuthorizationRequest,
  ProviderAuthorizationSession,
  ProviderCapability,
  ProviderConnectRequest,
  ProviderConnectResult
} from './providers'

export const Channels = {
  WorkspaceList: 'workspace:list',
  WorkspaceAdd: 'workspace:add',
  WorkspaceRemove: 'workspace:remove',
  WorkspaceOpen: 'workspace:open',
  EventWorkspaceRuntimeChanged: 'workspace:runtime-changed',
  ProjectOpenFolder: 'project:open-folder',
  ProjectOpenInEditor: 'project:open-in-editor',
  FileOpen: 'file:open',
  FileViewerGetContent: 'file-viewer:get-content',
  FileViewerOpenInEditor: 'file-viewer:open-in-editor',
  FileViewerShowInFolder: 'file-viewer:show-in-folder',
  AgentAdd: 'agent:add',
  AgentRemove: 'agent:remove',
  AgentSetMode: 'agent:set-mode',
  AgentSetVariant: 'agent:set-variant',
  AgentGetVariants: 'agent:get-variants',
  AgentSetModel: 'agent:set-model',
  AgentSetSpeed: 'agent:set-speed',
  AgentSetProfile: 'agent:set-profile',
  AgentSetAccount: 'agent:set-account',
  AgentGetAssignment: 'agent:get-assignment',
  AgentGetModel: 'agent:get-model',
  AgentGetContext: 'agent:get-context',
  ProviderModels: 'provider:models',
  ProviderFetchModels: 'provider:fetch-models',
  ProviderCatalog: 'provider:catalog',
  ProviderConnect: 'provider:connect',
  ProviderDisconnect: 'provider:disconnect',
  ProviderAccounts: 'provider:accounts',
  ProviderAuthorizationCreate: 'provider:authorization-create',
  ProviderAuthorizationGet: 'provider:authorization-get',
  ProviderAuthorizationOpen: 'provider:authorization-open',
  ProviderAuthorizationCancel: 'provider:authorization-cancel',
  ProviderAccountEnable: 'provider:account-enable',
  ProviderAccountDisable: 'provider:account-disable',
  ProviderAccountSwitch: 'provider:account-switch',
  ProviderAccountRemove: 'provider:account-remove',
  ProviderUsageRefresh: 'provider:usage-refresh',
  ProviderCapabilities: 'provider:capabilities',
  ProviderConnectMethod: 'provider:connect-method',
  TemplateList: 'template:list',
  TemplateSave: 'template:save',
  TemplateRemove: 'template:remove',
  PickFolder: 'dialog:pick-folder',
  PtyStart: 'pty:start',
  PtyStop: 'pty:stop',
  PtyRestart: 'pty:restart',
  PtyInput: 'pty:input',
  PtyInject: 'pty:inject',
  PtyResize: 'pty:resize',
  LogOpen: 'log:open',
  LogPath: 'log:path',
  AppQuit: 'app:quit',
  AppVersion: 'app:version',
  UpdaterCheck: 'updater:check',
  UpdaterInstall: 'updater:install',
  EventUpdaterStatus: 'updater:status',
  ChatSend: 'chat:send',
  ChatSendLegacy: 'chat:send-legacy',
  ChatStop: 'chat:stop',
  ChatStopLegacy: 'chat:stop-legacy',
  ChatRunCommand: 'chat:run-command',
  ChatUndo: 'chat:undo',
  ChatRedo: 'chat:redo',
  ChatNewSession: 'chat:new-session',
  ChatListMessages: 'chat:list-messages',
  ChatListTranscript: 'chat:list-transcript',
  ChatGetTodos: 'chat:get-todos',
  ChatIsRunning: 'chat:is-running',
  ChatRespondPrompt: 'chat:respond-prompt',
  ChatQueueRemove: 'chat:queue-remove',
  ChatQueueEdit: 'chat:queue-edit',
  SessionList: 'session:list',
  SessionActive: 'session:active',
  AgentSetWorker: 'agent:set-worker',
  SessionCreate: 'session:create',
  SessionSwitch: 'session:switch',
  SessionDelete: 'session:delete',
  SessionRename: 'session:rename',
  ProjectSessionList: 'project-session:list',
  ProjectSessionCreate: 'project-session:create',
  ProjectSessionSwitch: 'project-session:switch',
  ProjectSessionDelete: 'project-session:delete',
  ProjectSessionRename: 'project-session:rename',
  SessionSelectAgent: 'session:select-agent',
  SessionTranscript: 'session:transcript',
  SessionTodos: 'session:todos',
  SessionUsage: 'session:usage',
  SessionIsRunning: 'session:is-running',
  SessionUndo: 'session:undo',
  SessionRedo: 'session:redo',
  SessionQueueRemove: 'session:queue-remove',
  SessionQueueEdit: 'session:queue-edit',
  SettingsGet: 'settings:get',
  SettingsSave: 'settings:save',
  CommandList: 'commands:list',
  CommandSave: 'commands:save',
  CommandRemove: 'commands:remove',
  StatsGet: 'stats:get',
  McpStatus: 'mcp:status',
  WindowMinimize: 'window:minimize',
  WindowToggleMaximize: 'window:toggle-maximize',
  WindowClose: 'window:close',
  WindowIsMaximized: 'window:is-maximized',
  EventWindowMaximizedChange: 'window:maximized-change',
  TerminalOpen: 'terminal:open',
  TerminalClose: 'terminal:close',
  EventTerminalExit: 'terminal:exit',
  EventPtyData: 'pty:data',
  EventAgentState: 'agent:state',
  EventGitStatus: 'git:status',
  EventContextChanged: 'context:changed',
  EventChat: 'chat:event',
  FilesSuggest: 'files:suggest',
  AgentSetBackground: 'agent:set-background',
  EventAgentBackground: 'agent:background',
  EventAgentConfig: 'agent:config-changed',
  BrowserGetStatus: 'browser:get-status',
  BrowserPair: 'browser:pair',
  BrowserOpenInstallGuide: 'browser:open-install-guide',
  BrowserOpenExtensionFolder: 'browser:open-extension-folder',
  BrowserOpenChromeExtensions: 'browser:open-chrome-extensions',
  BrowserGetConsoleLogs: 'browser:get-console-logs',
  BrowserGetNetworkLogs: 'browser:get-network-logs',
  EventBrowserStatus: 'browser:status',
  RemoteGetStatus: 'remote:get-status',
  RemoteSetEnabled: 'remote:set-enabled',
  RemoteSetRelayUrl: 'remote:set-relay-url',
  RemoteStartPairing: 'remote:start-pairing',
  RemoteRevokeToken: 'remote:revoke-token',
  EventRemoteStatus: 'remote:status',
  EventBrowserOpenInstallGuide: 'browser:install-guide',
  TraceList: 'trace:list',
  TraceRead: 'trace:read',
  TraceDelete: 'trace:delete',
  EventTrace: 'trace:event',
  DirList: 'dir:list',
  ArtifactsList: 'artifacts:list',
  ArtifactsClear: 'artifacts:clear',
  EventArtifactsChanged: 'artifacts:changed',
  EventProviderAccountsChanged: 'provider:accounts-changed',
  EventProviderUsage: 'provider:usage',
  ProviderSnapshotGet: 'provider:snapshot-get',
  ProviderAccountRefresh: 'provider:account-refresh',
  ProviderResetCreditConsume: 'provider:reset-credit-consume',
  AgentListAssignments: 'agent:list-assignments',
  EventProviderSnapshotChanged: 'provider:snapshot-changed',
  AgentAssignmentGetSnapshot: 'agent:assignment-get-snapshot',
  AgentAssignmentSetSnapshot: 'agent:assignment-set-snapshot',
  EventAgentAssignmentChanged: 'agent:assignment-changed',
  EventProviderAuthorizationChanged: 'provider:authorization-changed'
} as const

export interface PtyDataEvent { agentId: string; data: string }
export interface TerminalExitEvent { id: string; exitCode: number | null }
export interface AgentStateEvent { agentId: string; state: AgentState }
export interface GitStatusEvent { projectPath: string; git: GitStatus | null }
export interface AgentConfigEvent { agentId: string; config: AgentConfig }
export interface WindowMaximizedChangeEvent { maximized: boolean }
export type BrowserStatusEvent = BrowserStatusInfo

export interface BrowserInstallGuideEvent {
  extensionDir: string
}

export interface ArtifactsChangedEvent {
  projectPath: string
  artifacts: ArtifactEntry[]
}

export interface AgentApi {
  listWorkspaces(): Promise<WorkspaceSummary[]>
  addWorkspace(projectPath: string, name: string): Promise<WorkspaceRuntime | null>
  removeWorkspace(projectPath: string): Promise<void>
  openWorkspace(projectPath: string): Promise<WorkspaceRuntime>
  onWorkspaceRuntimeChanged(cb: (runtime: WorkspaceRuntime) => void): () => void
  openInEditor(projectPath: string): Promise<void>
  openFolder(projectPath: string): Promise<void>
  openFile(payload: FileViewerPayload): Promise<void>
  getFileContent(path: string): Promise<FileContentResult>
  openFileInEditor(path: string): Promise<void>
  showFileInFolder(path: string): Promise<void>
  listDir(absPath: string): Promise<DirEntry[]>
  listArtifacts(projectPath: string): Promise<ArtifactEntry[]>
  clearArtifacts(projectPath: string): Promise<void>
  onArtifactsChanged(cb: (e: ArtifactsChangedEvent) => void): () => void
  openTerminal(cwd: string): Promise<TerminalInfo>
  closeTerminal(id: string): Promise<void>
  addAgent(projectPath: string, input: NewAgentInput): Promise<WorkspaceRuntime>
  removeAgent(projectPath: string, agentId: string): Promise<void>
  setAgentMode(agentId: string, mode: AgentMode): Promise<void>
  setAgentVariant(agentId: string, variant: string | null): Promise<void>
  getAgentVariants(agentId: string): Promise<string[]>
  setAgentModel(agentId: string, provider: string, model: string): Promise<void>
  setAgentSpeed(agentId: string, speed: 'standard' | 'fast'): Promise<void>
  setAgentProfile(agentId: string, profileName: string): Promise<void>
  setAgentAccount(agentId: string, accountId: string | null): Promise<void>
  getAgentAssignment(agentId: string): Promise<AgentModelAssignment | null>
  getAgentModel(agentId: string): Promise<ModelRef | null>
  getContextInfo(agentId: string): Promise<ContextInfo>
  getProviderModels(): Promise<ModelRef[]>
  fetchProviderModels(providerId: string): Promise<string[]>
  listProviderCatalog(): Promise<CatalogProviderSummary[]>
  listProviderCapabilities(): Promise<ProviderCapability[]>
  connectProviderMethod(request: ProviderConnectRequest): Promise<ProviderConnectResult>
  createProviderAuthorization(request: ProviderAuthorizationRequest): Promise<ProviderAuthorizationSession>
  getProviderAuthorization(loginId: string): Promise<ProviderAuthorizationSession | undefined>
  openProviderAuthorization(loginId: string): Promise<void>
  cancelProviderAuthorization(loginId: string): Promise<ProviderAuthorizationSession | undefined>
  connectProvider(providerId: string, apiKey: string, baseUrl?: string): Promise<BsSettings>
  disconnectProvider(providerId: string): Promise<BsSettings>
  listProviderAccounts(providerId?: string): Promise<ProviderConnection[]>
  setProviderAccountEnabled(accountId: string, enabled: boolean): Promise<void>
  switchProviderAccount(providerId: string, accountId: string): Promise<void>
  removeProviderAccount(accountId: string): Promise<void>
  refreshProviderUsage(providerId?: string, accountId?: string): Promise<ProviderUsage[]>
  onProviderAccountsChanged(cb: (e: ProviderConnection[]) => void): () => void
  onProviderUsage(cb: (e: ProviderUsage) => void): () => void
  onAgentAssignmentChanged(cb: (e: AgentAssignmentSnapshot) => void): () => void
  getProviderSnapshot(): Promise<ProviderSnapshot>
  onProviderSnapshotChanged(cb: (e: ProviderSnapshot) => void): () => void
  onProviderAuthorizationChanged(cb: (e: ProviderAuthorizationSession) => void): () => void
  refreshProviderAccount(providerId: string, accountId: string): Promise<ProviderSnapshot>
  consumeResetCredit(providerId: string, accountId: string): Promise<ConsumeResetCreditResult>
  getAgentAssignmentSnapshot(agentId: string): Promise<AgentAssignmentSnapshot | null>
  setAgentAssignmentSnapshot(request: AgentAssignmentSetRequest): Promise<AgentAssignmentSnapshot>
  listTemplates(): Promise<Template[]>
  saveTemplate(template: Template): Promise<Template>
  removeTemplate(id: string): Promise<void>
  pickFolder(): Promise<string | null>
  startAgent(agentId: string): Promise<void>
  stopAgent(agentId: string): Promise<void>
  restartAgent(agentId: string): Promise<void>
  writeInput(agentId: string, data: string): Promise<void>
  injectPrompt(agentId: string, text: string): Promise<void>
  resizePty(agentId: string, cols: number, rows: number): Promise<void>
  openLog(agentId: string): Promise<void>
  getLogPath(agentId: string): Promise<string>
  quit(): Promise<void>
  getAppVersion(): Promise<string>
  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>
  sendChat(agentId: string, text: string, images?: ImageAttachment[]): Promise<void>
  listAssignments(agentId: string): Promise<CoordinationAssignment[]>
  stopChat(agentId: string): Promise<void>
  listProjectSessions(projectPath: string): Promise<ProjectSessionSummary[]>
  createProjectSession(projectPath: string, agentId?: string): Promise<ProjectSessionSummary>
  switchProjectSession(projectPath: string, sessionId: string): Promise<ProjectSessionSummary | null>
  deleteProjectSession(projectPath: string, sessionId: string): Promise<ProjectSessionSummary>
  renameProjectSession(projectPath: string, sessionId: string, title: string): Promise<ProjectSessionSummary | null>
  selectProjectSessionAgent(projectPath: string, sessionId: string, agentId: string): Promise<ProjectSessionSummary>
  sendSessionChat(projectPath: string, sessionId: string, agentId: string, text: string, images?: ImageAttachment[]): Promise<void>
  stopSessionChat(projectPath: string, sessionId: string): Promise<void>
  listSessionTranscript(projectPath: string, sessionId: string): Promise<ChatTranscriptItem[]>
  getSessionTodos(projectPath: string, sessionId: string): Promise<TodoItem[]>
  getSessionUsage(projectPath: string, sessionId: string): Promise<UsageSummary>
  isSessionChatRunning(projectPath: string, sessionId: string): Promise<boolean>
  undoSessionChat(projectPath: string, sessionId: string): Promise<{ agentId: string; turnId: string } | null>
  redoSessionChat(projectPath: string, sessionId: string): Promise<{ agentId: string; turnId: string } | null>
  removeSessionQueued(projectPath: string, sessionId: string, messageId: string): Promise<void>
  editSessionQueued(projectPath: string, sessionId: string, messageId: string, text: string): Promise<void>
  suggestFiles(agentId: string, prefix: string): Promise<FileSuggestion[]>
  setAgentBackground(agentId: string, background: boolean): Promise<void>
  onAgentBackground(cb: (e: { agentId: string; background: boolean }) => void): () => void
  runCommand(agentId: string, name: string, args: string): Promise<void>
  undoChat(agentId: string): Promise<boolean>
  redoChat(agentId: string): Promise<boolean>
  newChatSession(agentId: string): Promise<SessionSummary>
  listChatMessages(agentId: string): Promise<ChatMessage[]>
  listChatTranscript(agentId: string): Promise<ChatTranscriptItem[]>
  getChatTodos(agentId: string): Promise<TodoItem[]>
  isChatRunning(agentId: string): Promise<boolean>
  respondPrompt(agentId: string, promptId: string, resp: PromptResponse): Promise<void>
  removeQueued(agentId: string, id: string): Promise<void>
  editQueued(agentId: string, id: string, text: string): Promise<void>
  listSessions(agentId: string): Promise<SessionSummary[]>
  activeSessionFor(agentId: string): Promise<string>
  setAgentWorker(agentId: string, worker: boolean): Promise<void>
  createSession(agentId: string): Promise<SessionSummary>
  switchSession(agentId: string, sessionId: string): Promise<SessionSummary | null>
  deleteSession(agentId: string, sessionId: string): Promise<SessionSummary>
  renameSession(agentId: string, sessionId: string, title: string): Promise<SessionSummary | null>
  traceList(agentId: string): Promise<TraceSummary[]>
  traceRead(sessionId: string): Promise<TraceEvent[]>
  traceDelete(sessionId: string): Promise<void>
  onTraceEvent(cb: (e: TraceEvent) => void): () => void
  getSettings(): Promise<BsSettings>
  saveSettings(settings: BsSettings): Promise<BsSettings>
  listCommands(projectPath: string): Promise<Command[]>
  saveCommand(command: Command): Promise<Command>
  removeCommand(name: string): Promise<void>
  getStats(): Promise<StatsSummary>
  getMcpStatus(): Promise<McpServerStatus[]>
  platform: string
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<void>
  closeWindow(): Promise<void>
  isWindowMaximized(): Promise<boolean>
  onWindowMaximizedChange(cb: (e: WindowMaximizedChangeEvent) => void): () => void
  onUpdaterStatus(cb: (e: UpdaterStatusEvent) => void): () => void
  onPtyData(cb: (e: PtyDataEvent) => void): () => void
  onTerminalExit(cb: (e: TerminalExitEvent) => void): () => void
  onAgentState(cb: (e: AgentStateEvent) => void): () => void
  onAgentConfig(cb: (e: AgentConfigEvent) => void): () => void
  onGitStatus(cb: (e: GitStatusEvent) => void): () => void
  onContextChanged(cb: (e: ContextChangedEvent) => void): () => void
  onChatEvent(cb: (e: ChatEvent) => void): () => void
  getBrowserStatus(): Promise<BrowserStatusInfo>
  pairBrowser(): Promise<PairingInfo>
  openBrowserInstallGuide(): Promise<void>
  openBrowserExtensionFolder(): Promise<void>
  openBrowserChromeExtensions(): Promise<void>
  getBrowserConsoleLogs(limit?: number): Promise<unknown[]>
  getBrowserNetworkLogs(limit?: number): Promise<unknown[]>
  onBrowserStatus(cb: (info: BrowserStatusInfo) => void): () => void
  getRemoteStatus(): Promise<RemoteStatus>
  setRemoteEnabled(enabled: boolean): Promise<void>
  setRemoteRelayUrl(url: string): Promise<void>
  startRemotePairing(): Promise<{ code: string; expiresAt: number } | null>
  revokeRemoteToken(): Promise<void>
  onRemoteStatus(cb: (s: RemoteStatus) => void): () => void
  onBrowserOpenInstallGuide(cb: (e: BrowserInstallGuideEvent) => void): () => void
}
