import { useCallback, useEffect, useState } from 'react'
import type { AgentConfig, CoordinationAssignment } from '@shared/types'
import ChatPanel from '../chat/ChatPanel'

export interface CoordinationTile {
  agent: AgentConfig
  sessionId: string
  assignment: CoordinationAssignment
}

// Newest assignment first, one tile per worker. A worker given two tasks in a
// row is one tile, not two: the tile is that agent's session, and the session
// already holds both exchanges in order.
export function coordinationTiles(
  assignments: CoordinationAssignment[], agents: AgentConfig[]
): CoordinationTile[] {
  const tiles: CoordinationTile[] = []
  for (const item of [...assignments].reverse()) {
    if (tiles.some(tile => tile.agent.id === item.workerId)) continue
    const agent = agents.find(candidate => candidate.id === item.workerId)
    // An agent removed from the project mid-run has no pane to render.
    if (agent) tiles.push({ agent, sessionId: item.sessionId, assignment: item })
  }
  return tiles
}

export interface CoordinatorSurfaceProps {
  projectPath: string
  coordinator: AgentConfig | null
  coordinatorSessionId: string | null
  agents: AgentConfig[]
  assignments: CoordinationAssignment[]
  onOpenFleet?: () => void
}

// One live chat per agent taking part, tiled. The first version of this screen
// showed a summary board instead — worker, task, state — on the theory that
// tool cards and streaming belonged to the chat frame this surface exists to
// be separate from. That was wrong in a way only use revealed: what goal 4
// asked to leave was the single-agent chat frame, not the detail. Stripped of
// the detail the screen was a silent wait, and the only way to see what an
// agent was doing was to open its own session by hand.
export function CoordinatorSurface({
  projectPath, coordinator, coordinatorSessionId, agents, assignments, onOpenFleet
}: CoordinatorSurfaceProps) {
  if (!coordinator) {
    // An empty screen is an invitation to act. One route, to the one place the
    // role is given — a picker here would be a second control doing the same
    // job, which is how the project ended up with two coordinators.
    return (
      <div className="coordinator-empty">
        <p>No agent is coordinating yet.</p>
        <p className="settings-hint">Pick one in Fleet, then give it something to organise here.</p>
        {onOpenFleet ? <button className="btn small" type="button" onClick={onOpenFleet}>Open Fleet</button> : null}
      </div>
    )
  }

  const workers = coordinationTiles(assignments, agents)

  return (
    <div className={`coordinator-surface tiles-${Math.min(workers.length, 3)}`}>
      <section className="coordinator-tile lead" aria-label={`Coordinator ${coordinator.name}`}>
        <header className="coordinator-tile-head">
          <strong>{coordinator.name}</strong>
          <span className="fleet-role">coordinates</span>
        </header>
        {coordinatorSessionId ? <ChatPanel
          agentId={coordinator.id}
          agents={[coordinator]}
          onAgentChange={() => {}}
          projectPath={projectPath}
          sessionId={coordinatorSessionId}
          onSessionChange={() => {}}
          cwd={coordinator.cwd}
          mode={coordinator.mode ?? 'coordinate'}
        /> : <p className="settings-hint">No session yet.</p>}
      </section>

      <div className="coordinator-workers">
        {workers.length === 0
          ? <p className="settings-hint">No work assigned yet. Whatever it delegates appears here as it runs.</p>
          : workers.map(({ agent, sessionId, assignment }) => (
            <section key={agent.id} className={`coordinator-tile state-${assignment.state}`} aria-label={agent.name}>
              <header className="coordinator-tile-head">
                <strong>{agent.name}</strong>
                <span className={`coordinator-state state-${assignment.state}`}>{STATE_LABEL[assignment.state]}</span>
              </header>
              <ChatPanel
                agentId={agent.id}
                agents={[agent]}
                onAgentChange={() => {}}
                projectPath={projectPath}
                sessionId={sessionId}
                onSessionChange={() => {}}
                cwd={agent.cwd}
                mode={agent.mode ?? 'build'}
              />
            </section>
          ))}
      </div>
    </div>
  )
}

const STATE_LABEL: Record<CoordinationAssignment['state'], string> = {
  running: 'running',
  completed: 'done',
  failed: 'failed',
  // Ran, used tools, wrote no reply. Calling that "failed" made a worker that
  // invoked two skills and stopped look identical to one that never started.
  'no-result': 'no reply'
}

export default function CoordinatorView({
  projectPath, coordinator, agents, onOpenFleet
}: {
  projectPath: string | null
  coordinator: AgentConfig | null
  agents: AgentConfig[]
  onOpenFleet?: () => void
}) {
  const [assignments, setAssignments] = useState<CoordinationAssignment[]>([])
  const [coordinatorSessionId, setCoordinatorSessionId] = useState<string | null>(null)
  const coordinatorId = coordinator?.id ?? null

  const reload = useCallback(() => {
    if (!coordinatorId) return
    void window.api.listAssignments(coordinatorId).then(setAssignments)
    void window.api.activeSessionFor(coordinatorId).then(setCoordinatorSessionId)
  }, [coordinatorId])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (!coordinatorId) return
    return window.api.onChatEvent(event => {
      if (event.agentId !== coordinatorId) return
      // Only the edges that change which tiles exist or what their chips say.
      // The transcripts inside them stream on their own — each ChatPanel is
      // subscribed to its own session, so nothing here refetches them.
      if (event.type === 'assignment-started' || event.type === 'assignment-finished') reload()
      if (event.type === 'done' || event.type === 'error') reload()
    })
  }, [coordinatorId, reload])

  if (!projectPath) return <div className="coordinator-empty"><p>No project open.</p></div>

  return (
    <CoordinatorSurface
      projectPath={projectPath}
      coordinator={coordinator}
      coordinatorSessionId={coordinatorSessionId}
      agents={agents}
      assignments={assignments}
      onOpenFleet={onOpenFleet}
    />
  )
}
