import { useState } from 'react'
import { Activity, Bot, ChevronLeft, ChevronRight, FolderKanban, Home, Settings } from 'lucide-react'
import { V2_NAV_ITEMS, type V2ScreenId } from './navigation'
import '../styles/tokens.css'

const icons = { home: Home, projects: FolderKanban, work: Activity, agents: Bot, settings: Settings }

export default function V2App() {
  const [screen, setScreen] = useState<V2ScreenId>('home')
  const [expanded, setExpanded] = useState(false)
  const active = V2_NAV_ITEMS.find(item => item.id === screen) ?? V2_NAV_ITEMS[0]

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
          <div className="v2-provider-health" title={expanded ? undefined : 'All providers healthy'}>
            <span className="v2-health-dot" aria-hidden="true" />
            {expanded ? <span>All providers healthy</span> : null}
          </div>
          <button type="button" className="v2-profile-button" aria-label="Open profile">
            <span className="v2-avatar" aria-hidden="true">A</span>
            {expanded ? <span>Alex Mitchell</span> : null}
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
        <header className="v2-main-header">
          <p className="v2-eyebrow">V2 workspace</p>
          <h1>{active.label}</h1>
          <p className="v2-main-subtitle">Project work, agents and runtime state in one operational workspace.</p>
        </header>
        <section className="v2-placeholder" aria-label={`${active.label} content`}>
          {active.label} projection content is introduced by the next P15 screen task.
        </section>
        </main>
      </div>
    </div>
  )
}
