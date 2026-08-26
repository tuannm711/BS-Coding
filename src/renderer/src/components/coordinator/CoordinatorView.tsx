import { useCallback, useEffect, useState } from 'react'
import { Square } from 'lucide-react'
import type { ChatMessage, CoordinationAssignment } from '@shared/types'

export interface CoordinatorBoardProps {
  coordinatorName: string | null
  messages: ChatMessage[]
  assignments: CoordinationAssignment[]
  running: boolean
  onSend: (text: string) => void
  onStop: () => void
  onOpenWorker: (workerId: string) => void
  onOpenFleet?: () => void
}

const STATE_LABEL: Record<CoordinationAssignment['state'], string> = {
  running: 'running',
  completed: 'done',
  failed: 'failed',
  // Ran, used tools, wrote no reply. Calling that "failed" was how a worker
  // that invoked two skills and stopped looked identical to one that never
  // started — and telling them apart meant opening its session by hand.
  'no-result': 'no reply'
}

function Assignment({ item, onOpenWorker }: {
  item: CoordinationAssignment
  onOpenWorker: (workerId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const tools = item.toolNames ?? []
  return (
    <div className={`coordinator-assignment state-${item.state}`}>
      <button className="coordinator-assignment-head" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <strong>{item.workerName}</strong>
        <span className={`coordinator-state state-${item.state}`}>{STATE_LABEL[item.state]}</span>
      </button>
      <div className="coordinator-task">{item.task}</div>
      {/* What it actually did, on the row. Without this the only way to learn
          that a worker had run two skills was to open its own session. */}
      {tools.length > 0 ? <div className="coordinator-tools">
        {tools.length} tool{tools.length === 1 ? '' : 's'} · {[...new Set(tools)].join(', ')}
      </div> : null}
      {item.result ? <div className="coordinator-result">{item.result}</div> : null}
      {item.state === 'no-result' && !item.result
        ? <p className="coordinator-note">Used its tools and ended without a reply.</p>
        : null}
      {open ? <div className="coordinator-assignment-detail">
        {tools.length > 0 ? <ol className="coordinator-tool-list">
          {tools.map((tool, index) => <li key={`${tool}-${index}`}><code>{tool}</code></li>)}
        </ol> : <p className="settings-hint">No tools used.</p>}
        <button className="btn small" type="button" onClick={() => onOpenWorker(item.workerId)}>
          Open {item.workerName} in Work
        </button>
      </div> : null}
    </div>
  )
}

// Presentational half, so every state can be asserted with renderToStaticMarkup
// the way StatsView and FeedRow are.
//
// What this deliberately does not render: tool cards, streaming detail, message
// editing. Those belong to the chat frame this surface exists to be separate
// from — to read the detail, open the worker's session.
export function CoordinatorBoard({
  coordinatorName, messages, assignments, running, onSend, onStop, onOpenWorker, onOpenFleet
}: CoordinatorBoardProps) {
  const [draft, setDraft] = useState('')

  if (!coordinatorName) {
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

  const send = () => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  return (
    <div className="coordinator-board">
      <section className="coordinator-side" aria-label={`Coordinator ${coordinatorName}`}>
        <header className="coordinator-head">
          <strong>{coordinatorName}</strong>
          {running ? <button className="btn small danger" type="button" onClick={onStop}>
            <Square size={12} aria-hidden="true" />Stop
          </button> : null}
        </header>
        <div className="coordinator-messages">
          {messages.length === 0
            ? <p className="settings-hint">Nothing yet. Give it something to organise.</p>
            : messages.map(message => (
              <div key={message.id} className={`coordinator-message ${message.role}`}>
                {message.displayText ?? message.text}
              </div>
            ))}
        </div>
        <div className="coordinator-input">
          <textarea
            value={draft}
            placeholder="What should be done?"
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
          />
          <button className="btn small" type="button" onClick={send} disabled={!draft.trim()}>Send</button>
        </div>
      </section>

      <section className="coordinator-work" aria-label="Assignments">
        <h6>Assignments</h6>
        {assignments.length === 0
          ? <p className="settings-hint">No work assigned yet.</p>
          : assignments.map(item => (
            <Assignment key={item.id} item={item} onOpenWorker={onOpenWorker} />
          ))}
      </section>
    </div>
  )
}

export default function CoordinatorView({
  coordinatorId, coordinatorName, onOpenWorker, onOpenFleet
}: {
  coordinatorId: string | null
  coordinatorName: string | null
  onOpenWorker: (workerId: string) => void
  onOpenFleet?: () => void
}) {
  const [assignments, setAssignments] = useState<CoordinationAssignment[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [running, setRunning] = useState(false)

  const reload = useCallback(() => {
    if (!coordinatorId) return
    void window.api.listAssignments(coordinatorId).then(setAssignments)
    void window.api.listChatMessages(coordinatorId).then(setMessages)
  }, [coordinatorId])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (!coordinatorId) return
    return window.api.onChatEvent(event => {
      if (event.agentId !== coordinatorId) return
      if (event.type === 'assignment-started' || event.type === 'assignment-finished') reload()
      if (event.type === 'turn-started') setRunning(true)
      if (event.type === 'done' || event.type === 'error') { setRunning(false); reload() }
    })
  }, [coordinatorId, reload])

  return (
    <CoordinatorBoard
      coordinatorName={coordinatorName}
      messages={messages}
      assignments={assignments}
      running={running}
      onSend={text => { if (coordinatorId) void window.api.sendChat(coordinatorId, text) }}
      onStop={() => { if (coordinatorId) void window.api.stopAgent(coordinatorId) }}
      onOpenWorker={onOpenWorker}
      onOpenFleet={onOpenFleet}
    />
  )
}
