import { contextBridge, ipcRenderer } from 'electron'
import { Channels } from '../shared/ipc'
import type { ArtifactsChangedEvent } from '../shared/ipc'
import type { AgentMode, AgentRole, ChatEvent, Command, ContextChangedEvent, FileViewerPayload, ImageAttachment, BsSettings, NewAgentInput, PromptResponse, ProviderConnection, ProviderUsage, Template, TraceEvent, UpdaterStatusEvent, WorkspaceRuntime } from '../shared/types'
import type { AgentApi, AgentConfigEvent, AgentStateEvent, BrowserInstallGuideEvent, GitStatusEvent, PtyDataEvent, TerminalExitEvent, WindowMaximizedChangeEvent } from '../shared/ipc'
import type { BrowserStatusInfo } from '../shared/browser-types'
import type { RemoteStatus } from '../shared/remote-types'
import type { ProviderAuthorizationRequest, ProviderAuthorizationSession, ProviderConnectRequest } from '../shared/providers'
import type { AgentAssignmentSetRequest, AgentAssignmentSnapshot } from '../shared/provider-state'
import type { ProviderSnapshot } from '../shared/provider-state'

function subscribe<T>(channel: string, cb: (e: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: AgentApi = {
  listWorkspaces: () => ipcRenderer.invoke(Channels.WorkspaceList),
  addWorkspace: (projectPath: string, name: string) =>
    ipcRenderer.invoke(Channels.WorkspaceAdd, projectPath, name),
  removeWorkspace: (projectPath: string) =>
    ipcRenderer.invoke(Channels.WorkspaceRemove, projectPath),
  openWorkspace: (projectPath: string) =>
    ipcRenderer.invoke(Channels.WorkspaceOpen, projectPath),
  onWorkspaceRuntimeChanged: (cb: (runtime: WorkspaceRuntime) => void) =>
    subscribe(Channels.EventWorkspaceRuntimeChanged, cb),
  openInEditor: (projectPath: string) =>
    ipcRenderer.invoke(Channels.ProjectOpenInEditor, projectPath),
  openFolder: (projectPath: string) =>
    ipcRenderer.invoke(Channels.ProjectOpenFolder, projectPath),
  openFile: (payload: FileViewerPayload) =>
    ipcRenderer.invoke(Channels.FileOpen, payload),
  getFileContent: (path: string) =>
    ipcRenderer.invoke(Channels.FileViewerGetContent, path),
  openFileInEditor: (path: string) =>
    ipcRenderer.invoke(Channels.FileViewerOpenInEditor, path),
  showFileInFolder: (path: string) =>
    ipcRenderer.invoke(Channels.FileViewerShowInFolder, path),
  listDir: (absPath: string) =>
    ipcRenderer.invoke(Channels.DirList, absPath),
  listArtifacts: (projectPath: string) =>
    ipcRenderer.invoke(Channels.ArtifactsList, projectPath),
  clearArtifacts: (projectPath: string) =>
    ipcRenderer.invoke(Channels.ArtifactsClear, projectPath),
  onArtifactsChanged: (cb: (e: ArtifactsChangedEvent) => void) =>
    subscribe(Channels.EventArtifactsChanged, cb),
  openTerminal: (cwd: string) =>
    ipcRenderer.invoke(Channels.TerminalOpen, cwd),
  closeTerminal: (id: string) =>
    ipcRenderer.invoke(Channels.TerminalClose, id),
  addAgent: (projectPath: string, input: NewAgentInput) =>
    ipcRenderer.invoke(Channels.AgentAdd, projectPath, input),
  removeAgent: (projectPath: string, agentId: string) =>
    ipcRenderer.invoke(Channels.AgentRemove, projectPath, agentId),
  setAgentMode: (agentId: string, mode: AgentMode) =>
    ipcRenderer.invoke(Channels.AgentSetMode, agentId, mode),
  setAgentVariant: (agentId: string, variant: string | null) =>
    ipcRenderer.invoke(Channels.AgentSetVariant, agentId, variant),
  getAgentVariants: (agentId: string) =>
    ipcRenderer.invoke(Channels.AgentGetVariants, agentId),
  setAgentModel: (agentId: string, provider: string, model: string) =>
    ipcRenderer.invoke(Channels.AgentSetModel, agentId, provider, model),
  setAgentSpeed: (agentId: string, speed: 'standard' | 'fast') =>
    ipcRenderer.invoke(Channels.AgentSetSpeed, agentId, speed),
  setAgentProfile: (agentId: string, profileName: string) =>
    ipcRenderer.invoke(Channels.AgentSetProfile, agentId, profileName),
  setAgentAccount: (agentId: string, accountId: string | null) =>
    ipcRenderer.invoke(Channels.AgentSetAccount, agentId, accountId),
  getAgentAssignment: (agentId: string) => ipcRenderer.invoke(Channels.AgentGetAssignment, agentId),
  getAgentModel: (agentId: string) => ipcRenderer.invoke(Channels.AgentGetModel, agentId),
  getContextInfo: (agentId: string) => ipcRenderer.invoke(Channels.AgentGetContext, agentId),
  getProviderModels: () => ipcRenderer.invoke(Channels.ProviderModels),
  fetchProviderModels: (providerId: string) => ipcRenderer.invoke(Channels.ProviderFetchModels, providerId),
  listProviderCatalog: () => ipcRenderer.invoke(Channels.ProviderCatalog),
  listProviderCapabilities: () => ipcRenderer.invoke(Channels.ProviderCapabilities),
  connectProviderMethod: (request: ProviderConnectRequest) => ipcRenderer.invoke(Channels.ProviderConnectMethod, request),
  createProviderAuthorization: (request: ProviderAuthorizationRequest) => ipcRenderer.invoke(Channels.ProviderAuthorizationCreate, request),
  getProviderAuthorization: (loginId: string) => ipcRenderer.invoke(Channels.ProviderAuthorizationGet, loginId),
  openProviderAuthorization: (loginId: string) => ipcRenderer.invoke(Channels.ProviderAuthorizationOpen, loginId),
  cancelProviderAuthorization: (loginId: string) => ipcRenderer.invoke(Channels.ProviderAuthorizationCancel, loginId),
  connectProvider: (providerId: string, apiKey: string, baseUrl?: string) =>
    ipcRenderer.invoke(Channels.ProviderConnect, providerId, apiKey, baseUrl),
  disconnectProvider: (providerId: string) => ipcRenderer.invoke(Channels.ProviderDisconnect, providerId),
  listProviderAccounts: (providerId?: string) => ipcRenderer.invoke(Channels.ProviderAccounts, providerId),
  setProviderAccountEnabled: (accountId: string, enabled: boolean) =>
    ipcRenderer.invoke(enabled ? Channels.ProviderAccountEnable : Channels.ProviderAccountDisable, accountId),
  switchProviderAccount: (providerId: string, accountId: string) =>
    ipcRenderer.invoke(Channels.ProviderAccountSwitch, providerId, accountId),
  removeProviderAccount: (accountId: string) => ipcRenderer.invoke(Channels.ProviderAccountRemove, accountId),
  refreshProviderUsage: (providerId?: string, accountId?: string) =>
    ipcRenderer.invoke(Channels.ProviderUsageRefresh, providerId, accountId),
  listTemplates: () => ipcRenderer.invoke(Channels.TemplateList),
  saveTemplate: (template: Template) => ipcRenderer.invoke(Channels.TemplateSave, template),
  removeTemplate: (id: string) => ipcRenderer.invoke(Channels.TemplateRemove, id),
  pickFolder: () => ipcRenderer.invoke(Channels.PickFolder),
  startAgent: (agentId: string) => ipcRenderer.invoke(Channels.PtyStart, agentId),
  stopAgent: (agentId: string) => ipcRenderer.invoke(Channels.PtyStop, agentId),
  restartAgent: (agentId: string) => ipcRenderer.invoke(Channels.PtyRestart, agentId),
  writeInput: (agentId: string, data: string) =>
    ipcRenderer.invoke(Channels.PtyInput, agentId, data),
  injectPrompt: (agentId: string, text: string) =>
    ipcRenderer.invoke(Channels.PtyInject, agentId, text),
  resizePty: (agentId: string, cols: number, rows: number) =>
    ipcRenderer.invoke(Channels.PtyResize, agentId, cols, rows),
  openLog: (agentId: string) => ipcRenderer.invoke(Channels.LogOpen, agentId),
  getLogPath: (agentId: string) => ipcRenderer.invoke(Channels.LogPath, agentId),
  quit: () => ipcRenderer.invoke(Channels.AppQuit),
  getAppVersion: () => ipcRenderer.invoke(Channels.AppVersion),
  checkForUpdates: () => ipcRenderer.invoke(Channels.UpdaterCheck),
  installUpdate: () => ipcRenderer.invoke(Channels.UpdaterInstall),
  sendChat: (agentId: string, text: string, images?: ImageAttachment[]) =>
    ipcRenderer.invoke(Channels.ChatSendLegacy, agentId, text, images),
  listAssignments: (agentId: string) => ipcRenderer.invoke(Channels.AgentListAssignments, agentId),
  stopChat: (agentId: string) => ipcRenderer.invoke(Channels.ChatStopLegacy, agentId),
  listProjectSessions: (projectPath: string) => ipcRenderer.invoke(Channels.ProjectSessionList, projectPath),
  createProjectSession: (projectPath: string, agentId?: string) => ipcRenderer.invoke(Channels.ProjectSessionCreate, projectPath, agentId),
  switchProjectSession: (projectPath: string, sessionId: string) => ipcRenderer.invoke(Channels.ProjectSessionSwitch, projectPath, sessionId),
  deleteProjectSession: (projectPath: string, sessionId: string) => ipcRenderer.invoke(Channels.ProjectSessionDelete, projectPath, sessionId),
  renameProjectSession: (projectPath: string, sessionId: string, title: string) => ipcRenderer.invoke(Channels.ProjectSessionRename, projectPath, sessionId, title),
  selectProjectSessionAgent: (projectPath: string, sessionId: string, agentId: string) => ipcRenderer.invoke(Channels.SessionSelectAgent, projectPath, sessionId, agentId),
  sendSessionChat: (projectPath: string, sessionId: string, agentId: string, text: string, images?: ImageAttachment[]) =>
    ipcRenderer.invoke(Channels.ChatSend, projectPath, sessionId, agentId, text, images),
  stopSessionChat: (projectPath: string, sessionId: string) => ipcRenderer.invoke(Channels.ChatStop, projectPath, sessionId),
  listSessionTranscript: (projectPath: string, sessionId: string) => ipcRenderer.invoke(Channels.SessionTranscript, projectPath, sessionId),
  getSessionTodos: (projectPath: string, sessionId: string) => ipcRenderer.invoke(Channels.SessionTodos, projectPath, sessionId),
  getSessionUsage: (projectPath: string, sessionId: string) => ipcRenderer.invoke(Channels.SessionUsage, projectPath, sessionId),
  isSessionChatRunning: (projectPath: string, sessionId: string) => ipcRenderer.invoke(Channels.SessionIsRunning, projectPath, sessionId),
  undoSessionChat: (projectPath: string, sessionId: string) => ipcRenderer.invoke(Channels.SessionUndo, projectPath, sessionId),
  redoSessionChat: (projectPath: string, sessionId: string) => ipcRenderer.invoke(Channels.SessionRedo, projectPath, sessionId),
  removeSessionQueued: (projectPath: string, sessionId: string, messageId: string) => ipcRenderer.invoke(Channels.SessionQueueRemove, projectPath, sessionId, messageId),
  editSessionQueued: (projectPath: string, sessionId: string, messageId: string, text: string) => ipcRenderer.invoke(Channels.SessionQueueEdit, projectPath, sessionId, messageId, text),
  runCommand: (agentId: string, name: string, args: string) =>
    ipcRenderer.invoke(Channels.ChatRunCommand, agentId, name, args),
  undoChat: (agentId: string) => ipcRenderer.invoke(Channels.ChatUndo, agentId),
  redoChat: (agentId: string) => ipcRenderer.invoke(Channels.ChatRedo, agentId),
  newChatSession: (agentId: string) => ipcRenderer.invoke(Channels.ChatNewSession, agentId),
  listChatMessages: (agentId: string) => ipcRenderer.invoke(Channels.ChatListMessages, agentId),
  listChatTranscript: (agentId: string) => ipcRenderer.invoke(Channels.ChatListTranscript, agentId),
  getChatTodos: (agentId: string) => ipcRenderer.invoke(Channels.ChatGetTodos, agentId),
  isChatRunning: (agentId: string) => ipcRenderer.invoke(Channels.ChatIsRunning, agentId),
  respondPrompt: (agentId: string, promptId: string, resp: PromptResponse) =>
    ipcRenderer.invoke(Channels.ChatRespondPrompt, agentId, promptId, resp),
  removeQueued: (agentId: string, id: string) =>
    ipcRenderer.invoke(Channels.ChatQueueRemove, agentId, id),
  editQueued: (agentId: string, id: string, text: string) =>
    ipcRenderer.invoke(Channels.ChatQueueEdit, agentId, id, text),
  listSessions: (agentId: string) => ipcRenderer.invoke(Channels.SessionList, agentId),
  activeSessionFor: (agentId: string) => ipcRenderer.invoke(Channels.SessionActive, agentId),
  setAgentRole: (agentId: string, role: AgentRole) => ipcRenderer.invoke(Channels.AgentSetRole, agentId, role),
  createSession: (agentId: string) => ipcRenderer.invoke(Channels.SessionCreate, agentId),
  switchSession: (agentId: string, sessionId: string) =>
    ipcRenderer.invoke(Channels.SessionSwitch, agentId, sessionId),
  deleteSession: (agentId: string, sessionId: string) =>
    ipcRenderer.invoke(Channels.SessionDelete, agentId, sessionId),
  renameSession: (agentId: string, sessionId: string, title: string) =>
    ipcRenderer.invoke(Channels.SessionRename, agentId, sessionId, title),
  traceList: (agentId: string) => ipcRenderer.invoke(Channels.TraceList, agentId),
  traceRead: (sessionId: string) => ipcRenderer.invoke(Channels.TraceRead, sessionId),
  traceDelete: (sessionId: string) => ipcRenderer.invoke(Channels.TraceDelete, sessionId),
  onTraceEvent: (cb: (e: TraceEvent) => void) => subscribe(Channels.EventTrace, cb),
  getSettings: () => ipcRenderer.invoke(Channels.SettingsGet),
  saveSettings: (settings: BsSettings) => ipcRenderer.invoke(Channels.SettingsSave, settings),
  listCommands: (projectPath: string) => ipcRenderer.invoke(Channels.CommandList, projectPath),
  saveCommand: (command: Command) => ipcRenderer.invoke(Channels.CommandSave, command),
  removeCommand: (name: string) => ipcRenderer.invoke(Channels.CommandRemove, name),
  getStats: () => ipcRenderer.invoke(Channels.StatsGet),
  getMcpStatus: () => ipcRenderer.invoke(Channels.McpStatus),
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.invoke(Channels.WindowMinimize),
  toggleMaximizeWindow: () => ipcRenderer.invoke(Channels.WindowToggleMaximize),
  closeWindow: () => ipcRenderer.invoke(Channels.WindowClose),
  isWindowMaximized: () => ipcRenderer.invoke(Channels.WindowIsMaximized),
  onWindowMaximizedChange: (cb: (e: WindowMaximizedChangeEvent) => void) =>
    subscribe(Channels.EventWindowMaximizedChange, cb),
  onUpdaterStatus: (cb: (e: UpdaterStatusEvent) => void) => subscribe(Channels.EventUpdaterStatus, cb),
  onPtyData: (cb: (e: PtyDataEvent) => void) => subscribe(Channels.EventPtyData, cb),
  onTerminalExit: (cb: (e: TerminalExitEvent) => void) => subscribe(Channels.EventTerminalExit, cb),
  onAgentState: (cb: (e: AgentStateEvent) => void) => subscribe(Channels.EventAgentState, cb),
  onAgentConfig: (cb: (e: AgentConfigEvent) => void) => subscribe(Channels.EventAgentConfig, cb),
  onGitStatus: (cb: (e: GitStatusEvent) => void) => subscribe(Channels.EventGitStatus, cb),
  onContextChanged: (cb: (e: ContextChangedEvent) => void) => subscribe(Channels.EventContextChanged, cb),
  onChatEvent: (cb: (e: ChatEvent) => void) => subscribe(Channels.EventChat, cb),
  onProviderAccountsChanged: (cb: (e: ProviderConnection[]) => void) =>
    subscribe(Channels.EventProviderAccountsChanged, cb),
  onProviderUsage: (cb: (e: ProviderUsage) => void) => subscribe(Channels.EventProviderUsage, cb),
  onAgentAssignmentChanged: (cb: (e: AgentAssignmentSnapshot) => void) => subscribe(Channels.EventAgentAssignmentChanged, cb),
  getProviderSnapshot: () => ipcRenderer.invoke(Channels.ProviderSnapshotGet),
  onProviderSnapshotChanged: (cb: (e: ProviderSnapshot) => void) => subscribe(Channels.EventProviderSnapshotChanged, cb),
  onProviderAuthorizationChanged: (cb: (e: ProviderAuthorizationSession) => void) => subscribe(Channels.EventProviderAuthorizationChanged, cb),
  refreshProviderAccount: (providerId: string, accountId: string) => ipcRenderer.invoke(Channels.ProviderAccountRefresh, providerId, accountId),
  consumeResetCredit: (providerId: string, accountId: string) => ipcRenderer.invoke(Channels.ProviderResetCreditConsume, providerId, accountId),
  getAgentAssignmentSnapshot: (agentId: string) => ipcRenderer.invoke(Channels.AgentAssignmentGetSnapshot, agentId),
  setAgentAssignmentSnapshot: (request: AgentAssignmentSetRequest) => ipcRenderer.invoke(Channels.AgentAssignmentSetSnapshot, request),
  getBrowserStatus: () => ipcRenderer.invoke(Channels.BrowserGetStatus),
  pairBrowser: () => ipcRenderer.invoke(Channels.BrowserPair),
  openBrowserInstallGuide: () => ipcRenderer.invoke(Channels.BrowserOpenInstallGuide),
  openBrowserExtensionFolder: () => ipcRenderer.invoke(Channels.BrowserOpenExtensionFolder),
  openBrowserChromeExtensions: () => ipcRenderer.invoke(Channels.BrowserOpenChromeExtensions),
  getBrowserConsoleLogs: (limit?: number) => ipcRenderer.invoke(Channels.BrowserGetConsoleLogs, limit),
  getBrowserNetworkLogs: (limit?: number) => ipcRenderer.invoke(Channels.BrowserGetNetworkLogs, limit),
  onBrowserStatus: (cb: (info: BrowserStatusInfo) => void) => subscribe(Channels.EventBrowserStatus, cb),
  getRemoteStatus: () => ipcRenderer.invoke(Channels.RemoteGetStatus),
  setRemoteEnabled: (enabled: boolean) => ipcRenderer.invoke(Channels.RemoteSetEnabled, enabled),
  setRemoteRelayUrl: (url: string) => ipcRenderer.invoke(Channels.RemoteSetRelayUrl, url),
  startRemotePairing: () => ipcRenderer.invoke(Channels.RemoteStartPairing),
  revokeRemoteToken: () => ipcRenderer.invoke(Channels.RemoteRevokeToken),
  onRemoteStatus: (cb: (s: RemoteStatus) => void) => subscribe(Channels.EventRemoteStatus, cb),
  onBrowserOpenInstallGuide: (cb: (e: BrowserInstallGuideEvent) => void) => subscribe(Channels.EventBrowserOpenInstallGuide, cb),
  suggestFiles: (agentId: string, prefix: string) =>
    ipcRenderer.invoke(Channels.FilesSuggest, agentId, prefix),
  setAgentBackground: (agentId: string, background: boolean) =>
    ipcRenderer.invoke(Channels.AgentSetBackground, agentId, background),
  onAgentBackground: (cb: (e: { agentId: string; background: boolean }) => void) =>
    subscribe(Channels.EventAgentBackground, cb)
}

contextBridge.exposeInMainWorld('api', api)
