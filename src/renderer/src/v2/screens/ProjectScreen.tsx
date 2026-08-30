import { useEffect, useState } from 'react'
import { ArrowLeft, GitBranch } from 'lucide-react'
import type { ProjectSummary } from '../../../../shared/v2/contracts/ui-projections'
import WorkSessionsView from './project/WorkSessionsView'
import FilesView from './project/FilesView'
import GitView from './project/GitView'
import ProjectAgentsView from './project/ProjectAgentsView'
import SkillsView from './project/SkillsView'
import McpView from './project/McpView'
import ProjectSettingsView from './project/ProjectSettingsView'

export const PROJECT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'work-sessions', label: 'Work Sessions' },
  { id: 'files', label: 'Files' },
  { id: 'git', label: 'Git' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'settings', label: 'Project Settings' }
] as const

type ProjectTabId = typeof PROJECT_TABS[number]['id']

interface Props {
  projectId: string | null
  onBack(): void
  onOpenWork(projectId: string, workSessionId: string): void
}

export default function ProjectScreen({ projectId, onBack, onOpenWork }: Props) {
  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [activeTab, setActiveTab] = useState<ProjectTabId>('overview')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let current = true
    setProject(null); setError(false)
    window.bs.v2['project.get']({ id: projectId }).then(value => {
      if (current) setProject(value)
    }, () => { if (current) setError(true) })
    return () => { current = false }
  }, [projectId])

  if (!projectId) return <ProjectMessage title="Choose a project" detail="Open a project from Home to inspect its V2 workspace." action={onBack} />
  if (error) return <ProjectMessage title="Project unavailable" detail="The project projection could not be loaded." action={onBack} />
  if (!project) return <ProjectMessage title="Loading project" detail="Reading project identity and revision…" />

  return (
    <div className="v2-screen v2-project-screen">
      <header className="v2-project-header">
        <button type="button" className="v2-icon-button" aria-label="Back to Home" onClick={onBack}><ArrowLeft size={16} /></button>
        <div className="v2-project-heading">
          <p className="v2-eyebrow">Project</p>
          <h1>{project.name}</h1>
          <div className="v2-project-meta"><span>{project.repoPath}</span><span><GitBranch size={13} />{project.defaultBranch}</span><span>{project.activeWorkCount} active Work Sessions</span></div>
        </div>
      </header>
      <nav className="v2-project-tabs" aria-label="Project sections">
        {PROJECT_TABS.map(tab => <button type="button" key={tab.id}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>
      <div className="v2-project-content">
        {activeTab === 'overview' ? <ProjectOverview project={project} /> : null}
        {activeTab === 'work-sessions' ? <WorkSessionsView projectId={project.id} onOpenWork={onOpenWork} /> : null}
        {activeTab === 'files' ? <FilesView projectId={project.id} /> : null}
        {activeTab === 'git' ? <GitView projectId={project.id} /> : null}
        {activeTab === 'agents' ? <ProjectAgentsView projectId={project.id} /> : null}
        {activeTab === 'skills' ? <SkillsView projectId={project.id} /> : null}
        {activeTab === 'mcp' ? <McpView projectId={project.id} /> : null}
        {activeTab === 'settings' ? <ProjectSettingsView project={project} /> : null}
      </div>
    </div>
  )
}

function ProjectOverview({ project }: { project: ProjectSummary }) {
  return <div className="v2-overview-grid">
    <section className="v2-summary-card"><span>Active work</span><strong>{project.activeWorkCount}</strong><small>Work Sessions currently open</small></section>
    <section className="v2-summary-card"><span>Default branch</span><strong className="v2-mono">{project.defaultBranch}</strong><small>Repository projection</small></section>
    <section className="v2-summary-card"><span>Projection revision</span><strong>{project.revision}</strong><small>Authoritative V2 state</small></section>
    <section className="v2-instructions-card"><p className="v2-kicker">Project instructions</p><h2>Rules stay with the project</h2><p>Agent instructions and project scope are resolved in main and exposed through safe projection data.</p></section>
  </div>
}

function ProjectMessage({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return <div className="v2-screen-message" role="status"><strong>{title}</strong><span>{detail}</span>{action ? <button type="button" onClick={action}>Back to Home</button> : null}</div>
}
