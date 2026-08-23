import { useEffect, useMemo, useState } from 'react'
import type { AgentModelAssignment, ProviderUsage } from '@shared/types'

export interface QuotaAgent {
  id: string
  name: string
}

interface AgentUsageState {
  assignment: AgentModelAssignment | null
  running: boolean
  sessionTokens?: { input: number; output: number }
}

export default function RightPanelQuota({ agents }: { agents: QuotaAgent[] }) {
  const [states, setStates] = useState<Record<string, AgentUsageState>>({})
  const [providerUsage, setProviderUsage] = useState<Record<string, ProviderUsage>>({})
  const agentKey = agents.map(agent => agent.id).join('|')

  useEffect(() => {
    let cancelled = false
    void Promise.all(agents.map(async agent => ({ agent, assignment: await window.api.getAgentAssignment(agent.id) }))).then(rows => {
      if (cancelled) return
      setStates(previous => Object.fromEntries(rows.map(({ agent, assignment }) => [agent.id, {
        assignment,
        running: previous[agent.id]?.running ?? false,
        sessionTokens: previous[agent.id]?.sessionTokens
      }])))
    })
    return () => { cancelled = true }
  }, [agentKey])

  useEffect(() => window.api.onChatEvent(event => {
    if (!agents.some(agent => agent.id === event.agentId)) return
    if (event.type === 'turn-started') {
      setStates(previous => ({ ...previous, [event.agentId]: { ...(previous[event.agentId] ?? { assignment: null }), running: true } }))
    } else if (event.type === 'done' || event.type === 'error') {
      setStates(previous => ({ ...previous, [event.agentId]: { ...(previous[event.agentId] ?? { assignment: null }), running: false } }))
    } else if (event.type === 'usage') {
      setStates(previous => ({ ...previous, [event.agentId]: {
        ...(previous[event.agentId] ?? { assignment: null, running: true }),
        sessionTokens: event.sessionTokens
      } }))
    }
  }), [agentKey])

  useEffect(() => window.api.onProviderUsage(usage => {
    setProviderUsage(previous => ({ ...previous, [usage.accountId]: usage }))
  }), [])
  useEffect(() => {
    void window.api.refreshProviderUsage().then(next => setProviderUsage(Object.fromEntries(next.map(item => [item.accountId, item]))))
  }, [])

  const rows = useMemo(() => {
    const grouped = new Map<string, { assignment: AgentModelAssignment; agents: string[]; models: Set<string>; running: boolean; input: number; output: number }>()
    for (const agent of agents) {
      const state = states[agent.id]
      if (!state?.assignment) continue
      const key = state.assignment.accountId
        ? `${state.assignment.provider}/${state.assignment.accountId}`
        : `${state.assignment.provider}/${state.assignment.model}`
      const row = grouped.get(key) ?? { assignment: state.assignment, agents: [], models: new Set<string>(), running: false, input: 0, output: 0 }
      row.agents.push(agent.name)
      row.models.add(state.assignment.model)
      row.running ||= state.running
      row.input += state.sessionTokens?.input ?? 0
      row.output += state.sessionTokens?.output ?? 0
      grouped.set(key, row)
    }
    return [...grouped.entries()]
  }, [agents, states])

  return (
    <section className="right-panel-quota" aria-label="Session model quota">
      <div className="right-panel-quota-header">
        <span>Session models</span>
        <span>{rows.length}</span>
      </div>
      <div className="right-panel-quota-list">
        {rows.length === 0 && <span className="right-panel-quota-empty">No active model in this session</span>}
        {rows.map(([key, row]) => {
          const quota = row.assignment.accountId ? providerUsage[row.assignment.accountId] : undefined
          return (
            <div className="right-panel-quota-row" key={key}>
              <div className="right-panel-quota-model">
                <span className={`agent-usage-status ${row.running ? 'running' : 'idle'}`} />
                <code title={key}>{[...row.models].join(', ')}</code>
                <span>{row.assignment.provider}</span>
              </div>
              <div className="right-panel-quota-meta">
                <span>{row.agents.join(', ')}</span>
                <span>{row.input.toLocaleString()} in · {row.output.toLocaleString()} out</span>
                <span>Quota {formatQuota(quota)} · Reset {quota?.resetAt ? formatCountdown(quota.resetAt) : '—'}{quota?.secondaryUsedPercent !== undefined ? ` · banked ${quota.secondaryUsedPercent}% used` : quota?.bankedUsed !== undefined ? ` · banked ${quota.bankedUsed.toLocaleString()}${quota.bankedLimit ? ` / ${quota.bankedLimit.toLocaleString()}` : ''}` : ''}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function formatQuota(usage?: ProviderUsage): string {
  if (!usage) return 'Unavailable'
  if (usage.status === 'unavailable') return usage.unavailableReason ?? 'Unavailable'
  if (usage.primaryUsedPercent !== undefined) return `${usage.primaryUsedPercent}% used`
  if (usage.tokensUsed === undefined) return 'Unavailable'
  return `${usage.tokensUsed.toLocaleString()}${usage.tokenLimit ? ` / ${usage.tokenLimit.toLocaleString()}` : ''}`
}

function formatCountdown(resetAt: number): string {
  const seconds = Math.max(0, Math.round((resetAt - Date.now()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
