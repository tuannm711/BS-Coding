import { useEffect, useMemo, useState } from 'react'
import type { AgentSettings, BsSettings, ModelRef, ProviderConnection, SubagentType } from '@shared/types'
import { OPENAI_OAUTH_MODELS } from '@shared/openai-oauth'
import Modal from './Modal'

const SUBMODEL_ROLES = ['research', 'general', 'reviewer'] as const

const defaultPrompt = (name: string) =>
  `You are ${name}, a coding agent running inside the BS Coding desktop app. ` +
  'You help the user build and maintain their codebase. Read files before editing them, ' +
  'run tests after changes, and keep answers concise.'

interface Props {
  agents: AgentSettings[]
  providers: BsSettings['providers']
  subagentModels?: Partial<Record<SubagentType, ModelRef>>
  onChangeAgents: (agents: AgentSettings[]) => void
  onChangeSubagentModels: (models?: Partial<Record<SubagentType, ModelRef>>) => void
}

export default function AgentsTab({ agents, providers, subagentModels, onChangeAgents, onChangeSubagentModels }: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [accounts, setAccounts] = useState<ProviderConnection[]>([])

  useEffect(() => {
    void window.api.listProviderAccounts().then(setAccounts)
    return window.api.onProviderAccountsChanged(setAccounts)
  }, [])

  const effectiveProviders = useMemo(() => {
    const oauth = accounts.find(c => c.providerId === 'openai')?.accounts.some(a => a.authMode === 'oauth' && a.status === 'active')
    if (!oauth) return providers
    const existing = providers.find(p => p.id === 'openai')
    if (existing) return providers.map(p => p.id === 'openai' ? { ...p, models: [...new Set([...p.models, ...OPENAI_OAUTH_MODELS])] } : p)
    return [...providers, { id: 'openai', apiKey: '', models: [...OPENAI_OAUTH_MODELS] }]
  }, [accounts, providers])

  const setRole = (role: SubagentType, ref: ModelRef | undefined) => {
    const next = { ...(subagentModels ?? {}) }
    if (ref) next[role] = ref
    else delete next[role]
    onChangeSubagentModels(Object.keys(next).length > 0 ? next : undefined)
  }

  const updateAgent = (index: number, patch: Partial<AgentSettings>) => {
    onChangeAgents(agents.map((a, i) => (i === index ? { ...a, ...patch } : a)))
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
      {agents.map((a, i) => (
        <div className="settings-row agents-row" key={a.name}>
          <div className="agents-row-head">
            <span className="agent-name">{a.name}</span>
            <button className="btn small" disabled={a.name === 'bs'} onClick={() => removeAgent(i)}>
              Remove
            </button>
          </div>
          <textarea
            className="input agents-prompt"
            value={a.systemPrompt}
            onChange={e => updateAgent(i, { systemPrompt: e.target.value })}
          />
          <div className="submodel-fields">
            <select
              className="input"
              value={a.provider ?? ''}
              onChange={e => {
                const provider = e.target.value || undefined
                const models = effectiveProviders.find(p => p.id === provider)?.models ?? []
                updateAgent(i, { provider, model: models[0], accountId: provider === 'openai' ? (accounts.find(c => c.providerId === 'openai')?.activeAccountId ?? undefined) : undefined })
              }}
            >
              <option value="">(default provider)</option>
              {effectiveProviders.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
            </select>
            <select
              className="input"
              value={a.model ?? ''}
              disabled={!a.provider}
              onChange={e => updateAgent(i, { model: e.target.value })}
            >
              {(effectiveProviders.find(p => p.id === a.provider)?.models ?? []).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {a.provider === 'openai' && (
              <select
                className="input"
                value={a.accountId ?? ''}
                onChange={e => updateAgent(i, { accountId: e.target.value || undefined })}
              >
                <option value="">(active ChatGPT account)</option>
                {(accounts.find(c => c.providerId === 'openai')?.accounts ?? []).filter(account => account.status === 'active').map(account => (
                  <option key={account.id} value={account.id}>{account.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}
      <div>
        <p className="settings-hint">
          Models used when the main agent dispatches sub-agents. Leave a role empty to inherit the main agent model.
        </p>
        {SUBMODEL_ROLES.map(role => {
          const ref = subagentModels?.[role]
          const provider = providers.find(p => p.id === ref?.provider)
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
                  onChange={e => setRole(role, e.target.value ? { provider: e.target.value, model: providers.find(p => p.id === e.target.value)?.models[0] ?? '' } : undefined)}
                >
                  <option value="">(inherit main agent model)</option>
                  {providers.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                </select>
                <select
                  className="input"
                  value={ref?.model ?? ''}
                  disabled={!ref?.provider}
                  onChange={e => setRole(role, { provider: ref!.provider, model: e.target.value })}
                >
                  {(provider?.models ?? []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )
        })}
      </div>
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
