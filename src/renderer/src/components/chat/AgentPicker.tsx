import { useMemo, useState } from 'react'

export interface AgentPickerOption {
  id: string
  name: string
  model?: string
}

interface Props {
  agents: AgentPickerOption[]
  value: string
  onChange: (agentId: string) => void
}

export default function AgentPicker({ agents, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const current = useMemo(() => agents.find(agent => agent.id === value), [agents, value])
  return (
    <div className="agent-picker">
      <button className="agent-picker-trigger" type="button" onClick={() => setOpen(currentOpen => !currentOpen)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="agent-picker-label">Agent</span>
        <strong>{current?.name ?? 'Select Agent'}</strong>
        <span className="model-caret" aria-hidden="true">▾</span>
      </button>
      {open ? <div className="agent-picker-menu" role="listbox">
        {agents.map(agent => (
          <button key={agent.id} type="button" role="option" aria-selected={agent.id === value} className={`agent-picker-item${agent.id === value ? ' active' : ''}`} onClick={() => {
            setOpen(false)
            onChange(agent.id)
          }}>
            <strong>{agent.name}</strong>
            <span>{agent.model ?? 'Model configured in Agents'}</span>
          </button>
        ))}
        {agents.length === 0 ? <span className="model-empty">No agents configured</span> : null}
      </div> : null}
    </div>
  )
}
