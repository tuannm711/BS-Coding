import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BrowserInstallGuideEvent } from '@shared/ipc'
import type { BrowserStatusInfo } from '@shared/browser-types'
import { Terminal } from '@xterm/xterm'
import type {
  AgentConfig, AgentState, ArtifactEntry, GitStatus, ProjectSessionSummary, Template, TerminalInfo, UpdaterStatusEvent, WorkspaceRuntime, WorkspaceSummary
} from '@shared/types'
import Sidebar from './components/Sidebar'
import PaneGrid from './components/PaneGrid'
import BackgroundPanel from './components/BackgroundPanel'
import EmptyState from './components/EmptyState'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import CoordinatorView from './components/coordinator/CoordinatorView'
import RightPanel, { type RightPanelTab } from './components/RightPanel'
import SettingsDialog from './components/settings/SettingsDialog'
import BrowserDialog from './components/BrowserDialog'
import InstallGuideDialog from './components/InstallGuideDialog'
import UpdateDialog from './components/UpdateDialog'
import { migrateBrandStorage } from './brand-storage'
import { projectVisiblePanes, resolveSelectedNativeAgent } from './shared-chat-selection'
import V2App from './v2/app/V2App'
import { rendererMode } from './v2/app/navigation'

migrateBrandStorage(window.localStorage)

export interface PaneModel {
  agent: AgentConfig
  state: AgentState
  git: GitStatus | null
}

export default function App() {
  return rendererMode(window.bs.v2.enabled) === 'v2' ? <V2App /> : <LegacyApp />
}

function LegacyApp() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showModelRouter, setShowModelRouter] = useState(false)
  const [runtime, setRuntime] = useState<WorkspaceRuntime | null>(null)
  const [selectedNativeAgentId, setSelectedNativeAgentId] = useState<string | null>(null)
  const [activeProjectSessionId, setActiveProjectSessionId] = useState<string | null>(null)
  const [backgrounds, setBackgrounds] = useState<Record<string, boolean>>({})
  const [browser, setBrowser] = useState<BrowserStatusInfo | null>(null)
  const [browserDialogOpen, setBrowserDialogOpen] = useState(false)
  const [installGuide, setInstallGuide] = useState<BrowserInstallGuideEvent | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdaterStatusEvent | null>(null)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [upToDateOpen, setUpToDateOpen] = useState(false)
  const manualCheckRef = useRef(false)
  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('bs.rightpanel.open') !== '0')
  const [rightTab, setRightTab] = useState<RightPanelTab>(() => {
    const stored = localStorage.getItem('bs.rightpanel.tab')
    // Validated rather than cast: a value stored before the fleet tab existed,
    // or one hand-edited, must not select a view that is not there.
    return stored === 'artifacts' || stored === 'fleet' ? stored : 'tree'
  })
  const [projectSessions, setProjectSessions] = useState<ProjectSessionSummary[]>([])
  const [artifacts, setArtifacts] = useState<Record<string, ArtifactEntry[]>>({})
  const termsRef = useRef<Map<string, Terminal>>(new Map())
  const buffersRef = useRef<Map<string, string>>(new Map())

  const refreshWorkspaces = useCallback(async () => {
    setWorkspaces(await window.api.listWorkspaces())
  }, [])

  useEffect(() => {
    localStorage.setItem('bs.rightpanel.open', rightOpen ? '1' : '0')
  }, [rightOpen])
  useEffect(() => {
    localStorage.setItem('bs.rightpanel.tab', rightTab)
  }, [rightTab])

  useEffect(() => {
    return window.api.onArtifactsChanged(({ projectPath, artifacts: list }) => {
      setArtifacts(prev => ({ ...prev, [projectPath]: list }))
    })
  }, [])

  useEffect(() => {
    void refreshWorkspaces()
    void window.api.listTemplates().then(setTemplates)
  }, [refreshWorkspaces])

  useEffect(() => {
    const offData = window.api.onPtyData(({ agentId, data }) => {
      const term = termsRef.current.get(agentId)
      if (term) {
        term.write(data)
      } else {
        buffersRef.current.set(agentId, (buffersRef.current.get(agentId) ?? '') + data)
      }
    })
    const offWorkspaceRuntime = window.api.onWorkspaceRuntimeChanged(next => {
      setRuntime(previous => {
        if (!previous || previous.workspace.projectPath !== next.workspace.projectPath) return previous
        for (const id of buffersRef.current.keys()) {
          if (!next.workspace.agents.some(agent => agent.id === id)) buffersRef.current.delete(id)
        }
        setBackgrounds(current => Object.fromEntries(next.workspace.agents.map(agent => [
          agent.id,
          current[agent.id] ?? agent.background ?? false
        ])))
        return { ...next, git: previous.git }
      })
      void window.api.listWorkspaces().then(setWorkspaces)
    })
    const offState = window.api.onAgentState(({ agentId, state }) => {
      setRuntime(prev => prev
        ? { ...prev, agents: prev.agents.map(a => (a.agentId === agentId ? state : a)) }
        : prev)
    })
    const offGit = window.api.onGitStatus(({ projectPath, git }) => {
      setRuntime(prev => prev && prev.workspace.projectPath === projectPath
        ? { ...prev, git }
        : prev)
    })
    const offBg = window.api.onAgentBackground(({ agentId, background }) => {
      setBackgrounds(prev => ({ ...prev, [agentId]: background }))
    })
    const offConfig = window.api.onAgentConfig(({ agentId, config }) => {
      setRuntime(prev => prev && prev.workspace.agents.some(a => a.id === agentId)
        ? {
            ...prev,
            workspace: {
              ...prev.workspace,
              agents: prev.workspace.agents.map(a => a.id === agentId ? config : a)
            }
          }
        : prev)
    })
    const offBrowser = window.api.onBrowserStatus((info) => {
      setBrowser(info)
    })
    const offInstallGuide = window.api.onBrowserOpenInstallGuide((e) => {
      setInstallGuide(e)
    })
    const offTerminalExit = window.api.onTerminalExit(({ id }) => {
      setTerminals(prev => prev.filter(t => t.id !== id))
      termsRef.current.delete(id)
      buffersRef.current.delete(id)
    })
    const offUpdater = window.api.onUpdaterStatus((e) => {
      setUpdateStatus(e)
      setUpdateChecking(e.type === 'checking')
      // Download runs in the background even when the popup is closed — when
      // it finishes, bring the dialog back so the user can restart now or
      // defer to later.
      if (e.type === 'update-available' || e.type === 'downloaded') setUpdateDialogOpen(true)
      if (e.type === 'error' || e.type === 'not-supported') setUpdateDialogOpen(false)
      // Only surface "up to date" when the user asked for a manual check —
      // the automatic check on startup must not pop a dialog.
      if (e.type === 'up-to-date' && manualCheckRef.current) {
        manualCheckRef.current = false
        setUpToDateOpen(true)
      }
    })
    void window.api.getBrowserStatus().then(setBrowser)
    return () => {
      offData()
      offWorkspaceRuntime()
      offState()
      offGit()
      offBg()
      offConfig()
      offBrowser()
      offInstallGuide()
      offTerminalExit()
      offUpdater()
    }
  }, [])

  const handleCheckUpdate = useCallback(() => {
    manualCheckRef.current = true
    window.api.checkForUpdates()
  }, [])

  const openWorkspace = useCallback(async (path: string) => {
    for (const t of terminals) {
      termsRef.current.delete(t.id)
      buffersRef.current.delete(t.id)
    }
    const rt = await window.api.openWorkspace(path)
    const native = rt.workspace.agents.filter(agent => agent.kind === 'native')
    const fallbackAgentId = resolveSelectedNativeAgent(native, null) ?? undefined
    // Paint as soon as the workspace is known. Everything below is a further
    // IPC round trip, and holding setRuntime until they all resolved is what
    // made switching project feel slow: the shell showed the previous project
    // until the last of them came back.
    setRuntime(rt)
    setTerminals([])
    setSelectedNativeAgentId(resolveSelectedNativeAgent(native, fallbackAgentId ?? null))
    setBackgrounds(Object.fromEntries(rt.workspace.agents.map(a => [a.id, a.background ?? false])))
    // Independent of each other, so they wait together rather than in turn.
    const [projectSessions, list] = await Promise.all([
      fallbackAgentId ? window.api.listProjectSessions(path) : Promise.resolve([]),
      window.api.listArtifacts(path)
    ])
    const projectSession = projectSessions[0]
      ?? (fallbackAgentId ? await window.api.createProjectSession(path, fallbackAgentId) : null)
    setActiveProjectSessionId(projectSession?.id ?? null)
    if (projectSession?.lastAgentId) {
      setSelectedNativeAgentId(resolveSelectedNativeAgent(native, projectSession.lastAgentId))
    }
    setArtifacts(prev => ({ ...prev, [path]: list }))
    for (const id of buffersRef.current.keys()) {
      if (!rt.workspace.agents.some(a => a.id === id)) buffersRef.current.delete(id)
    }
  }, [terminals])

  const projectPath = runtime?.workspace.projectPath ?? null

  const reloadProjectSessions = useCallback(() => {
    if (!projectPath) { setProjectSessions([]); return }
    void window.api.listProjectSessions(projectPath).then(setProjectSessions)
  }, [projectPath])

  useEffect(() => { reloadProjectSessions() }, [reloadProjectSessions])

  // The running dot and a session's title both change from chat events, so the
  // list follows the same edges the status bar does rather than polling.
  useEffect(() => window.api.onChatEvent(event => {
    if (event.type === 'turn-started' || event.type === 'done' || event.type === 'error'
      || event.type === 'user-message' || event.type === 'assignment-started') reloadProjectSessions()
  }), [reloadProjectSessions])

  const handleSelectSession = useCallback((sessionId: string) => {
    if (!projectPath) return
    void window.api.switchProjectSession(projectPath, sessionId).then(next => {
      if (!next) return
      setActiveProjectSessionId(next.id)
      if (next.lastAgentId) setSelectedNativeAgentId(next.lastAgentId)
      reloadProjectSessions()
    })
  }, [projectPath, reloadProjectSessions])

  const handleCreateSession = useCallback(() => {
    if (!projectPath) return
    void window.api.createProjectSession(projectPath, selectedNativeAgentId ?? undefined).then(next => {
      setActiveProjectSessionId(next.id)
      reloadProjectSessions()
    })
  }, [projectPath, selectedNativeAgentId, reloadProjectSessions])

  const handleDeleteSession = useCallback((sessionId: string) => {
    if (!projectPath) return
    void window.api.deleteProjectSession(projectPath, sessionId).then(next => {
      setActiveProjectSessionId(next?.id ?? null)
      reloadProjectSessions()
    })
  }, [projectPath, reloadProjectSessions])

  const handleProjectSessionChange = useCallback((sessionId: string, agentId?: string) => {
    setActiveProjectSessionId(sessionId)
    if (agentId) setSelectedNativeAgentId(agentId)
  }, [])

  const removeWorkspace = useCallback(async (path: string) => {
    if (runtime?.workspace.projectPath === path) {
      for (const agent of runtime.workspace.agents) {
        termsRef.current.delete(agent.id)
        buffersRef.current.delete(agent.id)
      }
    }
    try {
      await window.api.removeWorkspace(path)
    } catch {
      /* surface via sidebar later; still refresh list */
    }
    setRuntime(prev => prev && prev.workspace.projectPath === path ? null : prev)
    void refreshWorkspaces()
  }, [runtime, refreshWorkspaces])

  const removeAgent = useCallback(async (agentId: string) => {
    const path = runtime?.workspace.projectPath
    if (!path) return
    try {
      await window.api.removeAgent(path, agentId)
    } catch {
      /* surface via pane menu later; still refresh */
    }
    termsRef.current.delete(agentId)
    buffersRef.current.delete(agentId)
    const rt = await window.api.openWorkspace(path)
    setRuntime(rt)
    setWorkspaces(await window.api.listWorkspaces())
  }, [runtime])

  const addTerminal = useCallback(async (projectPath: string) => {
    if (runtime?.workspace.projectPath !== projectPath) await openWorkspace(projectPath)
    const t = await window.api.openTerminal(projectPath)
    setTerminals(prev => [...prev, t])
  }, [runtime, openWorkspace])

  const removeTerminal = useCallback((id: string) => {
    void window.api.closeTerminal(id)
    setTerminals(prev => prev.filter(t => t.id !== id))
    termsRef.current.delete(id)
    buffersRef.current.delete(id)
  }, [])

  const handleRemovePane = useCallback((id: string) => {
    if (terminals.some(t => t.id === id)) removeTerminal(id)
    else void removeAgent(id)
  }, [terminals, removeTerminal, removeAgent])

  const registerTerminal = useCallback((agentId: string, term: Terminal) => {
    termsRef.current.set(agentId, term)
    const buf = buffersRef.current.get(agentId)
    if (buf) {
      term.write(buf)
      buffersRef.current.delete(agentId)
    }
  }, [])

  const unregisterTerminal = useCallback((agentId: string) => {
    termsRef.current.delete(agentId)
    buffersRef.current.delete(agentId)
  }, [])

  const allPanes: PaneModel[] = useMemo(() => {
    if (!runtime) return []
    const agentPanes = runtime.workspace.agents.map(agent => ({
      agent,
      state: runtime.agents.find(s => s.agentId === agent.id) ?? {
        agentId: agent.id, status: 'spawning', exitCode: null, lastOutputAt: null, alert: 'normal'
      },
      git: runtime.git
    }))
    const terminalPanes: PaneModel[] = terminals.map(term => ({
      agent: { id: term.id, name: term.name, templateId: '__terminal__', cwd: term.cwd, kind: 'pty' as const },
      state: { agentId: term.id, status: 'running' as const, exitCode: null, lastOutputAt: null, alert: 'normal' as const },
      git: runtime.git
    }))
    return [...agentPanes, ...terminalPanes]
  }, [runtime, terminals])
  const nativeAgents = useMemo(() => runtime?.workspace.agents.filter(agent => agent.kind === 'native') ?? [], [runtime?.workspace.agents])
  const effectiveNativeAgentId = resolveSelectedNativeAgent(nativeAgents, selectedNativeAgentId)
  const panes = useMemo(() => projectVisiblePanes(allPanes, effectiveNativeAgentId), [allPanes, effectiveNativeAgentId])
  // find, not filter, because at most one match is possible: setMode enforces
  // one coordinator per project. The invariant lives in the manager, not here —
  // when it lived nowhere, this line silently picked one of two.
  const coordinator = useMemo(
    () => nativeAgents.find(agent => agent.mode === 'coordinate') ?? null,
    [nativeAgents]
  )
  // Selects the agent in the Work view, and says only that. It cannot show the
  // assignment's own transcript: Work is bound to a project session, while a
  // delegated turn runs in the worker's own agent session. The board shows the
  // detail inline instead of pretending this navigates to it.
  const handleOpenWorker = useCallback((workerId: string) => {
    setSelectedNativeAgentId(workerId)
    setCoordinateOpen(false)
  }, [])
  // Not closed when the coordinator goes away. The view now says so and offers
  // the route to Fleet, which is more use than being thrown back to the panes
  // with no explanation.
  const [coordinateOpen, setCoordinateOpen] = useState(false)

  useEffect(() => {
    setSelectedNativeAgentId(current => resolveSelectedNativeAgent(nativeAgents, current))
  }, [nativeAgents])

  return (
    <div className="app">
      <TitleBar
        panelOpen={rightOpen}
        onTogglePanel={() => setRightOpen(v => !v)}
        coordinateOpen={coordinateOpen}
        coordinatorName={coordinator?.name ?? null}
        onToggleCoordinate={() => setCoordinateOpen(v => !v)}
      />
      <div className="app-body">
        <Sidebar
          workspaces={workspaces}
          templates={templates}
          activePath={runtime?.workspace.projectPath ?? null}
          sessions={projectSessions}
          activeSessionId={activeProjectSessionId}
          onSelectSession={handleSelectSession}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
          onOpen={openWorkspace}
          onRemove={removeWorkspace}
          onRefresh={refreshWorkspaces}
          onOpenTerminal={addTerminal}
          onOpenSettings={() => setShowSettings(true)}
          onOpenModelRouter={() => setShowModelRouter(true)}
          onCheckUpdate={handleCheckUpdate}
          updateChecking={updateChecking}
        />
        <main className="main">
          {/* Hidden, not unmounted. Switching to Coordination used to tear down
              every pane — xterm instances included — and rebuild them on the way
              back, replaying buffers each time. RightPanel already keeps its
              views mounted for the same reason. */}
          {coordinateOpen ? (
            <CoordinatorView
              projectPath={runtime?.workspace.projectPath ?? null}
              coordinator={coordinator}
              agents={nativeAgents}
              onOpenFleet={() => { setRightOpen(true); setRightTab('fleet') }}
            />
          ) : null}
          {panes.length > 0 ? (
            <div className={coordinateOpen ? 'main-stack hidden' : 'main-stack'}>
              <PaneGrid
                panes={panes}
                nativeAgents={nativeAgents}
                onSelectNativeAgent={setSelectedNativeAgentId}
                projectPath={runtime?.workspace.projectPath ?? null}
                sessionId={activeProjectSessionId}
                onSessionChange={handleProjectSessionChange}
                backgrounds={backgrounds}
                isTerminal={id => terminals.some(t => t.id === id)}
                onRemove={handleRemovePane}
                onRegisterTerminal={registerTerminal}
                onUnregisterTerminal={unregisterTerminal}
              />
              <BackgroundPanel
                panes={allPanes}
                backgrounds={backgrounds}
                onOpen={agentId => void window.api.setAgentBackground(agentId, false)}
                onStop={agentId => {
                  const pane = allPanes.find(p => p.agent.id === agentId)
                  if (pane?.agent.kind === 'native' && runtime && activeProjectSessionId) {
                    void window.api.stopSessionChat(runtime.workspace.projectPath, activeProjectSessionId)
                  }
                  else void window.api.stopAgent(agentId)
                }}
              />
            </div>
          ) : coordinateOpen ? null : (
            <EmptyState hasWorkspace={runtime !== null} />
          )}
        </main>
        {rightOpen && (
          // agents is every native agent in the project, not only the visible
          // panes: a roster that hides an agent is the fault Fleet exists to fix.
          <RightPanel
            root={runtime?.workspace.projectPath ?? null}
            tab={rightTab}
            artifacts={artifacts[runtime?.workspace.projectPath ?? ''] ?? []}
            agents={nativeAgents}
            onSelectAgent={setSelectedNativeAgentId}
            onSetRole={(agentId, role) => { void window.api.setAgentRole(agentId, role) }}
            onTabChange={setRightTab}
            onClearArtifacts={() => {
              const p = runtime?.workspace.projectPath
              if (p) void window.api.clearArtifacts(p)
            }}
          />
        )}
      </div>
      <StatusBar
        workspaceName={runtime?.workspace.name ?? null}
        git={runtime?.git ?? null}
        agents={runtime?.agents ?? []}
        browser={browser}
        onBrowserClick={() => setBrowserDialogOpen(true)}
      />
      {browserDialogOpen && (
        <BrowserDialog status={browser} onClose={() => setBrowserDialogOpen(false)} />
      )}
      {installGuide && (
        <InstallGuideDialog guide={installGuide} onClose={() => setInstallGuide(null)} />
      )}
      {updateDialogOpen && (updateStatus?.type === 'update-available' || updateStatus?.type === 'downloaded' || updateStatus?.type === 'download-progress') && (
        <UpdateDialog
          status={updateStatus}
          onClose={() => setUpdateDialogOpen(false)}
          onInstall={() => void window.api.installUpdate()}
        />
      )}
      {upToDateOpen && (
        <UpToDateDialog version={updateStatus?.type === 'up-to-date' ? updateStatus.currentVersion : undefined} onClose={() => setUpToDateOpen(false)} />
      )}
      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          projectPath={runtime?.workspace.projectPath ?? undefined}
          templates={templates}
          onTemplatesChange={setTemplates}
          runtimeAgents={allPanes.filter(pane => pane.agent.kind === 'native').map(pane => ({ id: pane.agent.id, name: pane.agent.name }))}
        />
      )}
      {showModelRouter && (
        <ModelRouterComingSoon onClose={() => setShowModelRouter(false)} />
      )}
    </div>
  )
}

function UpToDateDialog({ version, onClose }: { version?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>Update</h3>
        <button className="dialog-close" aria-label="Close" onClick={onClose}>✕</button>
        <p className="settings-hint">
          Đây là phiên bản mới nhất{version ? ` (v${version})` : ''}.
        </p>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function ModelRouterComingSoon({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>Model Router</h3>
        <button className="dialog-close" aria-label="Close" onClick={onClose}>✕</button>
        <p className="settings-hint">Coming soon.</p>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
