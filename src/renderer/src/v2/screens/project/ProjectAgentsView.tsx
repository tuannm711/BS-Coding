import { useEffect, useState } from 'react'
import type { AgentSettingsProjection } from '../../../../../shared/v2/contracts/ui-projections'

export default function ProjectAgentsView({ projectId }: { projectId: string }) {
  const [value, setValue] = useState<AgentSettingsProjection | null>(null); const [error, setError] = useState(false)
  useEffect(() => { let current = true; window.bs.v2['agent.listByProject']({ projectId }).then(result => {
    if (current) setValue(result)
  }, () => { if (current) setError(true) }); return () => { current = false } }, [projectId])
  if (error) return <div className="v2-panel-state" role="alert">Project Agents are unavailable.</div>
  if (!value) return <div className="v2-panel-state" role="status">Loading Agents…</div>
  if (!value.agents.length) return <div className="v2-panel-state">No Agents are defined for this project.</div>
  return <div className="v2-tab-list">{value.agents.map(agent => <div className="v2-tab-row" key={agent.id}><span><strong>{agent.name}</strong><small>{agent.role}</small></span><span className="v2-status-pill">{agent.status}</span></div>)}</div>
}
