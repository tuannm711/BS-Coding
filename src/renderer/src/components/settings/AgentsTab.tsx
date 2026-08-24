import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { AgentSettings, ModelRef, SubagentType } from '@shared/types'
import { shouldAcceptSnapshot, type AgentAssignmentSetRequest, type ProviderSnapshot } from '@shared/provider-state'
import AgentPromptModal from './AgentPromptModal'
import Modal from './Modal'

const SUBMODEL_ROLES = ['research', 'general', 'reviewer'] as const

const defaultPrompt = (name: string) =>
  `You are ${name}, a coding agent running inside the BS Coding desktop app. ` +
  'You help the user build and maintain their codebase. Read files before editing them, ' +
  'run tests after changes, and keep answers concise.'

interface Props {
  agents: AgentSettings[]
  runtimeAgents: Array<{ id: string; name: string }>
  subagentModels?: Partial<Record<SubagentType, ModelRef>>
  onChangeAgents: (agents: AgentSettings[]) => void
  onChangeSubagentModels: (models?: Partial<Record<SubagentType, ModelRef>>) => void
}

export function connectedProviderOptions(snapshot: ProviderSnapshot | null) {
  return (snapshot?.providers ?? []).filter(provider => snapshot?.accounts.some(account => account.providerId === provider.id && account.status === 'active' && account.models.length > 0))
}

export function agentModelOptions(agent: AgentSettings, snapshot: ProviderSnapshot | null): Array<{ id: string; name: string; needsReview: boolean }> {
  const offered = snapshot?.accounts
    .filter(account => account.providerId === agent.provider && account.status === 'active' && (!agent.accountId || account.id === agent.accountId))
    .flatMap(account => account.models) ?? []
  const unique = [...new Map(offered.map(model => [model.id, { id: model.id, name: model.name, needsReview: false }])).values()]
  if (agent.model && !unique.some(model => model.id === agent.model)) unique.unshift({ id: agent.model, name: agent.model, needsReview: true })
  return unique
}

export function hydrateAgentsFromAssignments(
  agents: AgentSettings[],
  snapshot: ProviderSnapshot | null,
  runtimeBindings: Record<string, string>,
  editedAgentNames: ReadonlySet<string> = new Set()
): AgentSettings[] {
  return agents.map(agent => {
    if (editedAgentNames.has(agent.name)) return agent
    const agentId = runtimeBindings[agent.name]
    const assignment = agentId ? snapshot?.assignments.find(item => item.agentId === agentId) : undefined
    return assignment ? { ...agent, provider: assignment.providerId || undefined, accountId: assignment.accountId, model: assignment.modelId || undefined, speed: assignment.speed } : agent
  })
}

export function assignmentRequestForAgent(agentId: string, agent: AgentSettings): AgentAssignmentSetRequest | null {
  if (!agent.provider || !agent.accountId || !agent.model) return null
  return { agentId, providerId: agent.provider ?? '', accountId: agent.accountId, modelId: agent.model ?? '', speed: agent.speed ?? 'standard' }
}

export function reconcileAgentProviderSelection(agent: AgentSettings, provider: string | undefined): AgentSettings {
  return { ...agent, provider, accountId: undefined, model: undefined }
}

export function reconcileAgentAccountSelection(agent: AgentSettings, accountId: string | undefined, offeredModelIds: string[]): AgentSettings {
  return {
    ...agent,
    accountId,
    model: agent.model && offeredModelIds.includes(agent.model) ? agent.model : undefined
  }
}

export default function AgentsTab({ agents, runtimeAgents, subagentModels, onChangeAgents, onChangeSubagentModels }: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null)
  const [editedAgentNames, setEditedAgentNames] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const apply = (next: ProviderSnapshot) => setSnapshot(current => !current || shouldAcceptSnapshot(current.revision, next.revision) ? next : current)
    void window.api.getProviderSnapshot().then(apply)
    return window.api.onProviderSnapshotChanged(apply)
  }, [])

  const runtimeBindings = useMemo(() => {
    const grouped = new Map<string, Array<{ id: string; name: string }>>()
    for (const agent of runtimeAgents) grouped.set(agent.name, [...(grouped.get(agent.name) ?? []), agent])
    return Object.fromEntries([...grouped.entries()].filter(([, matches]) => matches.length === 1).map(([name, matches]) => [name, matches[0].id]))
  }, [runtimeAgents])
  const providerOptions = useMemo(() => connectedProviderOptions(snapshot), [snapshot])
  const visibleAgents = useMemo(
    () => hydrateAgentsFromAssignments(agents, snapshot, runtimeBindings, editedAgentNames),
    [agents, snapshot, runtimeBindings, editedAgentNames]
  )

  const setRole = (role: SubagentType, ref: ModelRef | undefined) => {
    const next = { ...(subagentModels ?? {}) }
    if (ref) next[role] = ref
    else delete next[role]
    onChangeSubagentModels(Object.keys(next).length > 0 ? next : undefined)
  }

  const updateAgent = (index: number, patch: Partial<AgentSettings>) => {
    const next = visibleAgents.map((a, i) => (i === index ? { ...a, ...patch } : a))
    setEditedAgentNames(current => new Set(current).add(next[index].name))
    onChangeAgents(next)
    const agentId = runtimeBindings[next[index].name]
    if (!agentId) return
    const request = assignmentRequestForAgent(agentId, next[index])
    if (!request) return
    void window.api.setAgentAssignmentSnapshot(request).then(assignment => {
      setSnapshot(previous => {
        if (!previous) return previous
        const current = previous.assignments.find(item => item.agentId === assignment.agentId)
        if (current && current.revision > assignment.revision) return previous
        return { ...previous, assignments: [...previous.assignments.filter(item => item.agentId !== assignment.agentId), assignment] }
      })
    })
  }

  const openAdd = () => {
    setNewName('')
    setNewPrompt('')
    setAdding(true)
  }

  const addAgent = () => {
    const name = newName.trim()
    if (!name || agents.some(a => a.name === name)) return
    onChangeAgents([
      ...agents,
      {
        name,
        systemPrompt: newPrompt.trim() || defaultPrompt(name)
      }
    ])
    setAdding(false)
  }

  const removeAgent = (index: number) => {
    const name = agents[index]?.name
    if (name === 'bs') return
    onChangeAgents(agents.filter((_, i) => i !== index))
  }

  return (
    <div className="settings-tab agents-tab">
      <div className="agents-head">
        <p className="settings-hint">
          Agent system prompts. "bs" is the default native agent and cannot be removed.
        </p>
        <button className="btn primary small" onClick={openAdd}>+ Add agent</button>
      </div>
      <div className="agent-table-wrap">
        <table className="agent-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Provider</th>
              <th scope="col">Account</th>
              <th scope="col">Model</th>
              <th scope="col">Mode</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleAgents.map((agent, index) => (
              <tr className="agent-table-row" key={agent.name}>
                <th scope="row" title={agent.name}>{agent.name}</th>
                <td>
                  <select
                    className="input"
                    aria-label={`Provider for ${agent.name}`}
                    value={agent.provider ?? ''}
                    onChange={event => updateAgent(index, reconcileAgentProviderSelection(agent, event.target.value || undefined))}
                  >
                    <option value="">Default</option>
                    {providerOptions.map(provider => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    className="input"
                    aria-label={`Provider account for ${agent.name}`}
                    value={agent.accountId ?? ''}
                    disabled={!agent.provider}
                    onChange={event => {
                      const accountId = event.target.value || undefined
                      const modelIds = snapshot?.accounts.find(account => account.id === accountId)?.models.map(model => model.id) ?? []
                      updateAgent(index, reconcileAgentAccountSelection(agent, accountId, modelIds))
                    }}
                  >
                    <option value="">Select account</option>
                    {snapshot?.accounts.filter(account => account.providerId === agent.provider && account.status === 'active').map(account => (
                      <option key={account.id} value={account.id}>{account.label}{account.profile?.planName ? ` · ${account.profile.planName}` : ''}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="input"
                    aria-label={`Model for ${agent.name}`}
                    value={agent.model ?? ''}
                    disabled={!agent.provider || !agent.accountId}
                    onChange={event => updateAgent(index, { model: event.target.value || undefined })}
                  >
                    <option value="">Select model</option>
                    {agentModelOptions(agent, snapshot).map(model => <option key={model.id} value={model.id}>{model.name}{model.needsReview ? ' (needs review)' : ''}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    className="input agent-mode-select"
                    aria-label={`Mode for ${agent.name}`}
                    value={agent.speed ?? 'standard'}
                    onChange={event => updateAgent(index, { speed: event.target.value as 'standard' | 'fast' })}
                  >
                    <option value="standard">Standard</option>
                    <option value="fast">Fast</option>
                  </select>
                </td>
                <td>
                  <div className="agent-table-actions">
                    <button className="agent-icon-button" type="button" aria-label={`Edit system prompt for ${agent.name}`} title="Edit system prompt" onClick={() => setEditingIndex(index)}>
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button className="agent-icon-button danger" type="button" aria-label={`Delete ${agent.name}`} title={agent.name === 'bs' ? 'The default Agent cannot be deleted' : 'Delete Agent'} disabled={agent.name === 'bs'} onClick={() => removeAgent(index)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="subagent-models" aria-labelledby="subagent-models-heading">
        <h4 id="subagent-models-heading">Sub-agent model overrides</h4>
        <p className="settings-hint">
          Models used when the main agent dispatches sub-agents. Leave a role empty to inherit the main agent model.
        </p>
        {SUBMODEL_ROLES.map(role => {
          const ref = subagentModels?.[role]
          const providerModels = snapshot?.accounts.filter(account => account.providerId === ref?.provider && account.status === 'active').flatMap(account => account.models) ?? []
          return (
            <div className="settings-row agents-row" key={role}>
              <div className="agents-row-head">
                <span className="agent-name">{role}</span>
                <button className="btn small" onClick={() => setRole(role, undefined)}>Use main agent model</button>
              </div>
              <div className="submodel-fields">
                <select
                  className="input"
                  value={ref?.provider ?? ''}
                  onChange={e => setRole(role, e.target.value ? { provider: e.target.value, model: '' } : undefined)}
                >
                  <option value="">(inherit main agent model)</option>
                  {providerOptions.map(provider => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
                </select>
                <select
                  className="input"
                  value={ref?.model ?? ''}
                  disabled={!ref?.provider}
                  onChange={e => setRole(role, { provider: ref!.provider, model: e.target.value })}
                >
                  {[...new Map(providerModels.map(model => [model.id, model])).values()].map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
              </div>
            </div>
          )
        })}
      </section>
      {editingIndex !== null && visibleAgents[editingIndex] && (
        <AgentPromptModal
          agent={visibleAgents[editingIndex]}
          onClose={() => setEditingIndex(null)}
          onSave={systemPrompt => {
            updateAgent(editingIndex, { systemPrompt })
            setEditingIndex(null)
          }}
        />
      )}
      {adding && (
        <Modal
          title="Add agent"
          onClose={() => setAdding(false)}
          onSubmit={addAgent}
          submitLabel="Add"
          submitDisabled={!newName.trim()}
        >
          <div className="settings-field">
            <label className="label" htmlFor="agent-name">Name</label>
            <input
              id="agent-name"
              className="input"
              placeholder="agent name (e.g. reviewer)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="settings-field">
            <label className="label" htmlFor="agent-prompt">System prompt</label>
            <textarea
              id="agent-prompt"
              className="input agents-prompt"
              placeholder="System prompt for this agent. Leave empty to use the default."
              value={newPrompt}
              onChange={e => setNewPrompt(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
