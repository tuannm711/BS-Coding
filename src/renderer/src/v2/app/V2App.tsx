import { useEffect, useState } from 'react'
import { Activity, Bot, ChevronLeft, ChevronRight, FolderKanban, Home, Settings } from 'lucide-react'
import { V2_NAV_ITEMS, type V2ScreenId } from './navigation'
import HomeScreen from '../screens/HomeScreen'
import ProjectScreen from '../screens/ProjectScreen'
import type { ProviderAccountSummary } from '../../../../shared/v2/contracts/provider'
import WorkSessionScreen, { type WorkSelection } from '../screens/WorkSessionScreen'
import '../styles/tokens.css'

const icons = { home: Home, projects: FolderKanban, work: Activity, agents: Bot, settings: Settings }

export default function V2App() {
  const [screen, setScreen] = useState<V2ScreenId>('home')
  const [expanded, setExpanded] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [workSelection, setWorkSelection] = useState<WorkSelection | null>(null)
  const [providerAccounts, setProviderAccounts] = useState<readonly ProviderAccountSummary[] | null>(null)
  const [providerError, setProviderError] = useState(false)
  const active = V2_NAV_ITEMS.find(item => item.id === screen) ?? V2_NAV_ITEMS[0]
  useEffect(() => {
    let current = true
    window.bs.v2.provider.listAccounts().then(value => {
      if (current) setProviderAccounts(value)
    }, () => { if (current) setProviderError(true) })
    return () => { current = false }
  }, [])
  const unhealthyCount = providerAccounts?.filter(account => account.enabled && account.status !== 'HEALTHY').length ?? 0
  const providerHealth = providerError ? 'Provider health unavailable'
    : providerAccounts === null ? 'Loading provider health'
      : providerAccounts.length === 0 ? 'No provider accounts'
        : unhealthyCount > 0 ? `${unhealthyCount} provider accounts need attention`
          : 'All providers healthy'

  return (
    <div className="v2-app-shell" data-testid="v2-app-shell">
      <a className="v2-skip-link" href="#v2-main">Skip to content</a>
      <div className="v2-titlebar" data-testid="v2-titlebar" aria-hidden="true" />
      <div className="v2-workspace-shell">
        <nav className="v2-nav-rail" data-expanded={expanded} aria-label="Primary navigation">
        <div className="v2-brand">
          <span className="v2-brand-mark" aria-hidden="true">BS</span>
          {expanded ? <span className="v2-brand-name">BS Coding</span> : null}
        </div>
        <div className="v2-primary-nav">
          {V2_NAV_ITEMS.map(item => {
            const Icon = icons[item.icon]
            return (
              <button key={item.id} type="button" className="v2-nav-button"
                aria-current={screen === item.id ? 'page' : undefined}
                aria-label={item.label} title={expanded ? undefined : item.label}
                onClick={() => setScreen(item.id)}>
                <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
                {expanded ? <span>{item.label}</span> : null}
              </button>
            )
          })}
        </div>
        <div className="v2-rail-footer">
          <div className="v2-app-status" title={expanded ? undefined : 'V2 enabled'}>
            <span aria-hidden="true">V2</span>
            {expanded ? <span>Architecture enabled</span> : null}
          </div>
          <div className="v2-provider-health" data-tone={providerError || unhealthyCount > 0 ? 'warning' : 'ok'}
            title={expanded ? undefined : providerHealth}>
            <span className="v2-health-dot" aria-hidden="true" />
            {expanded ? <span>{providerHealth}</span> : null}
          </div>
          <button type="button" className="v2-profile-button" aria-label="Open profile">
            <span className="v2-avatar" aria-hidden="true">BS</span>
            {expanded ? <span>Local profile</span> : null}
          </button>
          <button type="button" className="v2-rail-toggle"
            aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
            {expanded ? <ChevronLeft size={15} aria-hidden="true" />
              : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        </div>
        </nav>
        <main id="v2-main" className="v2-main" tabIndex={-1}>
          {screen === 'home' ? <HomeScreen
            onOpenProject={id => { setProjectId(id); setScreen('projects') }}
            onOpenWork={(nextProjectId, workSessionId) => {
              setWorkSelection({ projectId: nextProjectId, workSessionId }); setScreen('work')
            }} /> : null}
          {screen === 'projects' ? <ProjectScreen projectId={projectId}
            onBack={() => setScreen('home')}
            onOpenWork={(nextProjectId, workSessionId) => {
              setWorkSelection({ projectId: nextProjectId, workSessionId }); setScreen('work')
            }} /> : null}
          {screen === 'work' ? <WorkSessionScreen selection={workSelection} onBack={() => setScreen('home')} /> : null}
          {screen !== 'home' && screen !== 'projects' && screen !== 'work' ? <>
            <header className="v2-main-header"><p className="v2-eyebrow">V2 workspace</p><h1>{active.label}</h1>
              <p className="v2-main-subtitle">Project work, agents and runtime state in one operational workspace.</p></header>
            <section className="v2-placeholder" aria-label={`${active.label} content`}>
              {active.label} projection content is introduced by the corresponding P15 screen task.
            </section>
          </> : null}
        </main>
      </div>
    </div>
  )
}
