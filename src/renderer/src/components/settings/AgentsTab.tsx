import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { AgentSettings } from '@shared/types'
import { shouldAcceptSnapshot, type AgentAssignmentSetRequest, type ProviderSnapshot } from '@shared/provider-state'
import AgentPromptModal from './AgentPromptModal'
import Modal from './Modal'
import { agentQuotaConflicts, boundQuotaPool, quotaPoolsForAccount } from '@shared/agent-quota-binding'

const defaultPrompt = (name: string) =>
  `You are ${name}, a coding agent running inside the BS Coding desktop app. ` +
  'You help the user build and maintain their codebase. Read files before editing them, ' +
  'run tests after changes, and keep answers concise.'

interface Props {
  agents: AgentSettings[]
  runtimeAgents: Array<{ id: string; name: string }>
  onChangeAgents: (agents: AgentSettings[]) => void
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
    return assignment ? { ...agent, provider: assignment.providerId || undefined, accountId: assignment.accountId, quotaPoolId: assignment.quotaPoolId, model: assignment.modelId || undefined, speed: assignment.speed } : agent
  })
}

export function assignmentRequestForAgent(agentId: string, agent: AgentSettings): AgentAssignmentSetRequest | null {
  if (!agent.provider || !agent.accountId || !agent.model) return null
  return { agentId, providerId: agent.provider ?? '', accountId: agent.accountId, modelId: agent.model ?? '', speed: agent.speed ?? 'standard', ...(agent.quotaPoolId ? { quotaPoolId: agent.quotaPoolId } : {}) }
}

export function reconcileAgentProviderSelection(agent: AgentSettings, provider: string | undefined): AgentSettings {
  return { ...agent, provider, accountId: undefined, quotaPoolId: undefined, model: undefined }
}

export function reconcileAgentAccountSelection(agent: AgentSettings, accountId: string | undefined, offeredModelIds: string[]): AgentSettings {
  return {
    ...agent,
    accountId,
    quotaPoolId: undefined,
    model: agent.model && offeredModelIds.includes(agent.model) ? agent.model : undefined
  }
}

export default function AgentsTab({ agents, runtimeAgents, onChangeAgents }: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [newProvider, setNewProvider] = useState('')
  const [newAccount, setNewAccount] = useState('')
  const [newQuota, setNewQuota] = useState('')
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null)
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

  const updateAgent = (index: number, patch: Partial<AgentSettings>) => {
    const next = visibleAgents.map((a, i) => (i === index ? { ...a, ...patch } : a))
    setEditedAgentNames(current => new Set(current).add(next[index].name))
    onChangeAgents(next)
  }

  const quotaOptions = (provider?: string, accountId?: string, name?: string) => {
    const account = snapshot?.accounts.find(item => item.providerId === provider && item.id === accountId && item.status === 'active')
    return account ? quotaPoolsForAccount(account).map(pool => {
      const owner = visibleAgents.find(agent => agent.name !== name && agent.provider === provider && agent.accountId === accountId && boundQuotaPool(agent, account) === pool.id)
      return { ...pool, owner: owner?.name }
    }) : []
  }
  const newPool = quotaOptions(newProvider, newAccount).find(pool => pool.id === newQuota && !pool.owner && pool.modelIds.length > 0)
  const conflicts = agentQuotaConflicts(visibleAgents, snapshot?.accounts ?? [])

  const openAdd = () => {
    setNewName('')
    setNewPrompt('')
    setNewProvider('')
    setNewAccount('')
    setNewQuota('')
    setAdding(true)
  }

  const addAgent = () => {
    const name = newName.trim()
    if (!name || agents.some(a => a.name === name) || !newPool) return
    onChangeAgents([
      ...visibleAgents,
      {
        name,
        systemPrompt: newPrompt.trim() || defaultPrompt(name),
        provider: newProvider,
        accountId: newAccount,
        quotaPoolId: newQuota,
        model: newPool.modelIds[0]
      }
    ])
    setAdding(false)
  }

  const removeAgent = (index: number) => {
    const name = agents[index]?.name
    if (!name) return
    onChangeAgents(visibleAgents.filter((_, i) => i !== index))
    setDeletingIndex(null)
  }

  return (
    <div className="settings-tab agents-tab">
      <div className="agents-head">
        <p className="settings-hint">
          One agent per account quota. Choose models from that quota in chat. Every agent can be removed.
        </p>
        <button className="btn primary small" onClick={openAdd}>+ Add agent</button>
      </div>
      {conflicts.map(conflict => <p key={conflict.key} className="settings-error" role="alert">Quota conflict: {conflict.agentNames.join(', ')}. Assign a different account or quota, or remove an agent before saving.</p>)}
      {visibleAgents.length === 0 && <p className="settings-hint">No agents configured. Add an agent to start a chat.</p>}
      <div className="agent-table-wrap">
        <table className="agent-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Provider</th>
              <th scope="col">Account</th>
              <th scope="col">Quota</th>
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
                      updateAgent(index, { ...reconcileAgentAccountSelection(agent, accountId, modelIds), model: undefined })
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
                    aria-label={`Quota for ${agent.name}`}
                    value={agent.quotaPoolId ?? (agent.accountId ? boundQuotaPool(agent, { id: agent.accountId, providerId: agent.provider ?? '' }) : '') ?? ''}
                    disabled={!agent.provider || !agent.accountId}
                    onChange={event => {
                      const pool = quotaOptions(agent.provider, agent.accountId, agent.name).find(item => item.id === event.target.value)
                      if (!pool || pool.owner) return
                      updateAgent(index, { quotaPoolId: pool.id, model: pool.modelIds.includes(agent.model ?? '') ? agent.model : pool.modelIds[0] })
                    }}
                  >
                    <option value="">Select quota</option>
                    {quotaOptions(agent.provider, agent.accountId, agent.name).map(pool => <option key={pool.id} value={pool.id} disabled={!!pool.owner || !pool.modelIds.length}>{pool.label}{pool.owner ? ` · used by ${pool.owner}` : !pool.modelIds.length ? ' · no models' : ''}</option>)}
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
                    <button className="agent-icon-button danger" type="button" aria-label={`Delete ${agent.name}`} title="Delete agent" onClick={() => setDeletingIndex(index)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deletingIndex !== null && visibleAgents[deletingIndex] && <Modal title={`Delete ${visibleAgents[deletingIndex].name}?`} onClose={() => setDeletingIndex(null)} showDefaultActions={false}>
        <p>This removes the agent from all projects and releases its quota when you save settings. Session history is kept.</p>
        <div className="dialog-actions"><button className="btn" onClick={() => setDeletingIndex(null)}>Cancel</button><button className="btn danger" onClick={() => removeAgent(deletingIndex)}>Delete agent</button></div>
      </Modal>}
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
          submitDisabled={!newName.trim() || agents.some(agent => agent.name === newName.trim()) || !newPool}
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
          {agents.some(agent => agent.name === newName.trim()) && <p className="settings-error" role="alert">An agent with this name already exists.</p>}
          <label className="label" htmlFor="new-agent-provider">Provider</label>
          <select id="new-agent-provider" className="input" value={newProvider} onChange={event => { setNewProvider(event.target.value); setNewAccount(''); setNewQuota('') }}>
            <option value="">Select provider</option>
            {providerOptions.map(provider => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
          </select>
          <label className="label" htmlFor="new-agent-account">Account</label>
          <select id="new-agent-account" className="input" value={newAccount} disabled={!newProvider} onChange={event => { setNewAccount(event.target.value); setNewQuota('') }}>
            <option value="">Select account</option>
            {snapshot?.accounts.filter(account => account.providerId === newProvider && account.status === 'active').map(account => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
          <label className="label" htmlFor="new-agent-quota">Quota</label>
          <select id="new-agent-quota" className="input" value={newQuota} disabled={!newAccount} onChange={event => setNewQuota(event.target.value)}>
            <option value="">Select quota</option>
            {quotaOptions(newProvider, newAccount).map(pool => <option key={pool.id} value={pool.id} disabled={!!pool.owner || !pool.modelIds.length}>{pool.label}{pool.owner ? ` · used by ${pool.owner}` : !pool.modelIds.length ? ' · no models' : ''}</option>)}
          </select>
          <p className="settings-hint">Choose the model later in chat. Quotas already assigned to another agent are unavailable.</p>
          <div className="settings-field">
            <label className="label" htmlFor="agent-prompt">System prompt</label>
            <textarea
              id="agent-prompt"
              className="input agents-prompt resize-none"
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
