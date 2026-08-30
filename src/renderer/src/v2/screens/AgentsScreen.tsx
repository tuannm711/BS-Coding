import { useCallback, useEffect, useState } from 'react'
import { Bot, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { AgentSettingsProjection, AgentSummary } from '../../../../shared/v2/contracts/ui-projections'

export default function AgentsScreen({ projectId }: { projectId: string | null }) {
  const [projection, setProjection] = useState<AgentSettingsProjection | null>(null)
  const [selected, setSelected] = useState<AgentSummary | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setProjection(projectId ? await window.bs.v2['agent.listByProject']({ projectId })
      : await window.bs.v2['agent.list']({}))
  }, [projectId])
  useEffect(() => { void refresh().catch(() => setError('Agent projection is unavailable.')) }, [refresh])

  const run = useCallback(async (operation: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await operation(); await refresh() } catch { setError('Agent command failed.') }
    finally { setBusy(false) }
  }, [refresh])

  if (!projection) return <div className="v2-panel-state" role={error ? 'alert' : 'status'}>{error || 'Loading Agents…'}</div>
  const projectScope = projection.projectId
  return <div className="v2-screen v2-agents-screen">
    <header className="v2-screen-header v2-split-heading"><div><p className="v2-eyebrow">Project scope · {projectScope}</p><h1>Project Agents</h1><p>Immutable definitions, roles and current runtime status.</p></div>
      <button type="button" className="v2-btn v2-btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} />Add Agent</button></header>
    {error ? <div className="v2-command-error" role="alert">{error}</div> : null}
    {!projection.agents.length ? <div className="v2-panel-state">No Agents are defined for this project.</div>
      : <div className="v2-agent-list">{projection.agents.map(agent => <button type="button" className="v2-agent-card" key={agent.id} onClick={() => setSelected(agent)}>
        <span className="v2-agent-icon"><Bot size={17} /></span><span><strong>{agent.name}</strong><small>{agent.role}</small></span>
        <span className="v2-status-pill">{agent.status}</span></button>)}</div>}

    {showCreate ? <AgentEditor title="Add Agent" busy={busy} onClose={() => setShowCreate(false)}
      onSave={(name, role) => run(async () => { await window.bs.v2['agent.create']({ scopeId: projectScope, name, role }); setShowCreate(false) })} /> : null}
    {selected ? <AgentInspector agent={selected} busy={busy} onClose={() => setSelected(null)}
      onUpdate={(name, role) => run(async () => { await window.bs.v2['agent.update']({ scopeId: projectScope,
        agentId: selected.id, patch: { name, role } }); setSelected(null) })}
      onRemove={() => run(async () => { await window.bs.v2['agent.remove']({ scopeId: projectScope,
        agentId: selected.id }); setSelected(null) })} /> : null}
  </div>
}

function AgentInspector({ agent, busy, onClose, onUpdate, onRemove }: { agent: AgentSummary; busy: boolean;
  onClose(): void; onUpdate(name: string, role: string): Promise<unknown>; onRemove(): Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <AgentEditor title="Edit Agent" initial={agent} busy={busy} onClose={() => setEditing(false)} onSave={onUpdate} />
  return <div className="v2-drawer-backdrop" onClick={onClose}><aside className="v2-runtime-drawer" aria-label="Agent inspector" onClick={event => event.stopPropagation()}>
    <header><h2>{agent.name}</h2><button type="button" aria-label="Close Agent inspector" onClick={onClose}><X size={16} /></button></header>
    <div className="v2-agent-inspector"><p className="v2-kicker">Role</p><h3>{agent.role}</h3><p>Status: {agent.status}</p>
      {agent.currentVersionId ? <p className="v2-mono">Version {agent.currentVersionId}</p> : null}
      <button type="button" className="v2-btn" onClick={() => setEditing(true)}><Pencil size={14} />Edit Agent</button>
      <button type="button" className="v2-btn v2-btn-danger" disabled={busy} onClick={() => void onRemove()}><Trash2 size={14} />Remove Agent</button></div>
  </aside></div>
}

function AgentEditor({ title, initial, busy, onClose, onSave }: { title: string; initial?: AgentSummary; busy: boolean;
  onClose(): void; onSave(name: string, role: string): Promise<unknown> }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [role, setRole] = useState(initial?.role ?? 'WORKER')
  return <div className="v2-modal-backdrop" onClick={onClose}><form className="v2-modal" aria-label={title} onClick={event => event.stopPropagation()}
    onSubmit={event => { event.preventDefault(); if (name.trim() && role.trim()) void onSave(name.trim(), role.trim()) }}>
    <header><h2>{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={onClose}><X size={16} /></button></header>
    <label>Name<input value={name} onChange={event => setName(event.target.value)} required /></label>
    <label>Role<input value={role} onChange={event => setRole(event.target.value)} required /></label>
    <footer><button type="button" className="v2-btn" onClick={onClose}>Cancel</button><button className="v2-btn v2-btn-primary" disabled={busy || !name.trim() || !role.trim()}>Save Agent</button></footer>
  </form></div>
}
