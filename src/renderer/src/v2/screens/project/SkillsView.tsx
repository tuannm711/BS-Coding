import { useEffect, useState } from 'react'
import type { SkillBindingSummary } from '../../../../../shared/v2/contracts/ui-projections'

export default function SkillsView({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<readonly SkillBindingSummary[] | null>(null); const [error, setError] = useState(false)
  useEffect(() => { let current = true; window.bs.v2['skill.list']({ projectId }).then(value => {
    if (current) setItems(value)
  }, () => { if (current) setError(true) }); return () => { current = false } }, [projectId])
  if (error) return <div className="v2-panel-state" role="alert">Skills are unavailable.</div>
  if (!items) return <div className="v2-panel-state" role="status">Loading Skills…</div>
  if (!items.length) return <div className="v2-panel-state">No Skills are bound to this project.</div>
  return <div className="v2-tab-list">{items.map(item => <div className="v2-tab-row" key={item.id}><span><strong>{item.name}</strong><small>{item.source} · {item.version}</small></span><span>{item.enabled ? 'Enabled' : 'Disabled'}</span></div>)}</div>
}
