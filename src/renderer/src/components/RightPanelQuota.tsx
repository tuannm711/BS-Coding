import { useEffect, useMemo, useState } from 'react'
import type { AgentModelAssignment, ProviderUsage } from '@shared/types'
import QuotaAccountCard from './quota/QuotaAccountCard'

export interface QuotaAgent {
  id: string
  name: string
}

interface AgentUsageState {
  assignment: AgentModelAssignment | null
  running: boolean
  sessionTokens?: { input: number; output: number }
  sessionCost?: number
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
        sessionTokens: previous[agent.id]?.sessionTokens,
        sessionCost: previous[agent.id]?.sessionCost
      }])))
    })
    return () => { cancelled = true }
  }, [agentKey])

  useEffect(() => {
    const refreshAssignment = (event: Event) => {
      const agentId = (event as CustomEvent<{ agentId?: string }>).detail?.agentId
      if (!agentId || !agents.some(agent => agent.id === agentId)) return
      void window.api.getAgentAssignment(agentId).then(assignment => {
        setStates(previous => previous[agentId] ? { ...previous, [agentId]: { ...previous[agentId], assignment } } : previous)
      })
    }
    window.addEventListener('bs:model-changed', refreshAssignment)
    return () => window.removeEventListener('bs:model-changed', refreshAssignment)
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
        sessionTokens: event.sessionTokens,
        sessionCost: event.sessionCost
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
    const grouped = new Map<string, { assignment: AgentModelAssignment; agents: Array<{ id: string; name: string; assignment: AgentModelAssignment; input: number; output: number; cost: number }>; models: Set<string>; running: boolean }>()
    for (const agent of agents) {
      const state = states[agent.id]
      if (!state?.assignment) continue
      const key = state.assignment.accountId
        ? `${state.assignment.provider}/${state.assignment.accountId}`
        : `${state.assignment.provider}/${state.assignment.model}`
      const row = grouped.get(key) ?? { assignment: state.assignment, agents: [], models: new Set<string>(), running: false }
      row.agents.push({ id: agent.id, name: agent.name, assignment: state.assignment, input: state.sessionTokens?.input ?? 0, output: state.sessionTokens?.output ?? 0, cost: state.sessionCost ?? 0 })
      row.models.add(state.assignment.model)
      row.running ||= state.running
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
          return <QuotaAccountCard key={key} usage={quota} agents={row.agents} compact onSpeedChange={(agentId, speed) => {
            setStates(previous => {
              const current = previous[agentId]
              return current?.assignment ? { ...previous, [agentId]: { ...current, assignment: { ...current.assignment, speed } } } : previous
            })
            void window.api.setAgentSpeed(agentId, speed)
          }} />
        })}
      </div>
    </section>
  )
}
