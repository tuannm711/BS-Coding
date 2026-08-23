import { useEffect, useMemo, useState } from 'react'
import type { AgentSettings } from '@shared/types'

export default function AgentPicker({ agentId, currentName }: { agentId: string; currentName: string }) {
  const [agents, setAgents] = useState<AgentSettings[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => { void window.api.getSettings().then(settings => setAgents(settings.agents)) }, [])
  const current = useMemo(() => agents.find(agent => agent.name === currentName), [agents, currentName])
  return (
    <div className="agent-picker">
      <button className="agent-picker-trigger" onClick={() => setOpen(value => !value)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="agent-picker-label">Agent</span>
        <strong>{current?.name ?? currentName}</strong>
        <span className="model-caret">▾</span>
      </button>
      {open && <div className="agent-picker-menu" role="listbox">
        {agents.map(agent => (
          <button key={agent.name} className={`agent-picker-item${agent.name === currentName ? ' active' : ''}`} onClick={() => {
            setOpen(false)
            void window.api.setAgentProfile(agentId, agent.name)
          }}>
            <strong>{agent.name}</strong>
            <span>{agent.provider ?? 'default'}{agent.model ? ` · ${agent.model}` : ''}</span>
          </button>
        ))}
        {agents.length === 0 && <span className="model-empty">No agents configured</span>}
      </div>}
    </div>
  )
}
