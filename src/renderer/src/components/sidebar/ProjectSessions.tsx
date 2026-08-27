import { Plus, Trash2 } from 'lucide-react'
import type { ProjectSessionSummary } from '@shared/types'

export interface SessionGroup {
  kind: 'coordination' | 'work'
  label: string
  sessions: ProjectSessionSummary[]
}

// Coordination first. A coordinated run is the thing you are watching when you
// have one; ordinary work is what you come back to afterwards. An empty group
// is dropped rather than shown empty — a heading over nothing is noise in a
// 279px rail.
export function groupSessions(sessions: ProjectSessionSummary[]): SessionGroup[] {
  const coordination = sessions.filter(session => session.kind === 'coordination')
  const work = sessions.filter(session => session.kind !== 'coordination')
  return [
    { kind: 'coordination' as const, label: 'Coordination', sessions: coordination },
    { kind: 'work' as const, label: 'Work', sessions: work }
  ].filter(group => group.sessions.length > 0)
}

export interface ProjectSessionsProps {
  sessions: ProjectSessionSummary[]
  activeSessionId: string | null
  onSelect: (sessionId: string) => void
  onCreate: () => void
  onDelete: (sessionId: string) => void
}

export default function ProjectSessions({
  sessions, activeSessionId, onSelect, onCreate, onDelete
}: ProjectSessionsProps) {
  const groups = groupSessions(sessions)
  return (
    <div className="project-sessions">
      <div className="project-sessions-head">
        <span>Sessions</span>
        <button className="btn ghost small" type="button" title="New session" aria-label="New session" onClick={onCreate}>
          <Plus size={13} aria-hidden="true" />
        </button>
      </div>
      {groups.length === 0
        ? <p className="settings-hint">No sessions yet.</p>
        : groups.map(group => (
          <div key={group.kind} className={`session-group ${group.kind}`}>
            <h6>{group.label}</h6>
            {group.sessions.map(session => (
              <div
                key={session.id}
                className={`session-row${session.id === activeSessionId ? ' active' : ''}`}
              >
                <button
                  className="session-open"
                  type="button"
                  title={session.title}
                  onClick={() => onSelect(session.id)}
                >
                  {/* The dot is the answer to "which one is working right now",
                      which the dropdown could not show at all. */}
                  {session.running ? <span className="session-running" aria-label="running" /> : null}
                  <span className="session-title">{session.title}</span>
                </button>
                <button
                  className="btn ghost small session-delete"
                  type="button"
                  title="Delete session"
                  aria-label={`Delete ${session.title}`}
                  onClick={() => onDelete(session.id)}
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}
