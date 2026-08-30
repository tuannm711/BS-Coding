import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, FolderKanban } from 'lucide-react'
import type { HomeProjection } from '../../../../shared/v2/contracts/ui-projections'

interface Props {
  onOpenProject(projectId: string): void
  onOpenWork(projectId: string, workSessionId: string): void
}

export default function HomeScreen({ onOpenProject, onOpenWork }: Props) {
  const [projection, setProjection] = useState<HomeProjection | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    window.bs.v2['project.list']({}).then(value => {
      if (current) setProjection(value)
    }, () => { if (current) setError(true) })
    return () => { current = false }
  }, [])

  if (error) return <ScreenMessage title="Home is unavailable" detail="The V2 project projection could not be loaded." />
  if (!projection) return <ScreenMessage title="Loading workspace" detail="Reading projects and active work…" busy />

  return (
    <div className="v2-screen v2-home-screen">
      <header className="v2-screen-header">
        <p className="v2-eyebrow">Operational workspace</p>
        <h1>Good morning</h1>
        <p>Continue where you left off</p>
      </header>

      <section className="v2-section" aria-labelledby="active-work-heading">
        <div className="v2-section-heading">
          <div><p className="v2-kicker">In progress</p><h2 id="active-work-heading">Active Work</h2></div>
          <span className="v2-count">{projection.activeWorkSessions.length}</span>
        </div>
        {projection.activeWorkSessions.length === 0 ? (
          <EmptyRow title="No active work" detail="Create a Work Session from a project to begin." />
        ) : (
          <div className="v2-list">
            {projection.activeWorkSessions.map(session => (
              <button className="v2-work-row" type="button" key={session.id}
                onClick={() => onOpenWork(session.projectId, session.id)}>
                <div className="v2-work-row-main">
                  <strong>{session.title}</strong>
                  <span>{session.goal}</span>
                </div>
                <div className="v2-work-progress" aria-label={`${session.completedTaskCount} of ${session.totalTaskCount} tasks complete`}>
                  <span>{session.completedTaskCount} / {session.totalTaskCount} tasks</span>
                  <span>{session.activeAgentCount} agents</span>
                  {session.attentionCount > 0 ? <span className="v2-text-warning">{session.attentionCount} needs attention</span> : null}
                </div>
                <span className="v2-status-pill">{session.status}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="v2-home-grid">
        <section className="v2-section" aria-labelledby="attention-heading">
          <div className="v2-section-heading">
            <div><p className="v2-kicker">Action queue</p><h2 id="attention-heading">Needs Attention</h2></div>
          </div>
          {projection.needsAttention.length === 0 ? (
            <EmptyRow title="Nothing blocked" detail="Required reviews and tasks are clear." />
          ) : projection.needsAttention.map(item => (
            <button className="v2-attention-row" type="button" key={item.id}
              onClick={() => onOpenWork(item.projectId, item.workSessionId)}>
              <AlertTriangle size={15} aria-hidden="true" />
              <span><strong>{item.title}</strong><small>{item.kind}</small></span>
            </button>
          ))}
        </section>

        <section className="v2-section" aria-labelledby="projects-heading">
          <div className="v2-section-heading">
            <div><p className="v2-kicker">Repository scope</p><h2 id="projects-heading">Recent Projects</h2></div>
          </div>
          {projection.projects.length === 0 ? (
            <EmptyRow title="No V2 projects" detail="Projects appear after they are added to V2 persistence." />
          ) : projection.projects.map(project => (
            <button className="v2-project-row" type="button" key={project.id}
              onClick={() => onOpenProject(project.id)}>
              <FolderKanban size={16} aria-hidden="true" />
              <span><strong>{project.name}</strong><small>{project.defaultBranch}</small></span>
              <span>{project.activeWorkCount} active</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  )
}

function ScreenMessage({ title, detail, busy = false }: { title: string; detail: string; busy?: boolean }) {
  return <div className="v2-screen-message" role={busy ? 'status' : 'alert'}><strong>{title}</strong><span>{detail}</span></div>
}

function EmptyRow({ title, detail }: { title: string; detail: string }) {
  return <div className="v2-empty-row"><strong>{title}</strong><span>{detail}</span></div>
}
