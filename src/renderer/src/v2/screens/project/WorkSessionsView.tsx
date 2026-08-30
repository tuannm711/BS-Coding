import { useEffect, useState } from 'react'
import type { WorkSessionSummary } from '../../../../../shared/v2/contracts/ui-projections'

interface Props { projectId: string; onOpenWork(projectId: string, workSessionId: string): void }

export default function WorkSessionsView({ projectId, onOpenWork }: Props) {
  const [items, setItems] = useState<readonly WorkSessionSummary[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => { let current = true; window.bs.v2['workSession.listByProject']({ projectId })
    .then(value => { if (current) setItems(value) }, () => { if (current) setError(true) }); return () => { current = false } }, [projectId])
  if (error) return <PanelState text="Work Sessions are unavailable." error />
  if (!items) return <PanelState text="Loading Work Sessions…" />
  if (items.length === 0) return <PanelState text="No Work Sessions in this project." />
  return <div className="v2-tab-list">{items.map(item => <button type="button" className="v2-tab-row" key={item.id}
    onClick={() => onOpenWork(projectId, item.id)}><span><strong>{item.title}</strong><small>{item.goal}</small></span>
    <span>{item.completedTaskCount}/{item.totalTaskCount} tasks</span><span className="v2-status-pill">{item.status}</span></button>)}</div>
}

function PanelState({ text, error = false }: { text: string; error?: boolean }) {
  return <div className="v2-panel-state" role={error ? 'alert' : 'status'}>{text}</div>
}
