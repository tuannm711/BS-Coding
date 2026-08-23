import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentModelAssignment, ProviderUsage } from '@shared/types'
import { shouldAcceptSnapshot, type ProviderSnapshot } from '@shared/provider-state'
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
  const snapshotRevision = useRef(0)
  const agentKey = agents.map(agent => agent.id).join('|')

  const applySnapshot = (snapshot: ProviderSnapshot) => {
    if (!shouldAcceptSnapshot(snapshotRevision.current, snapshot.revision)) return
    snapshotRevision.current = snapshot.revision
    setProviderUsage(Object.fromEntries(snapshot.accounts.filter(account => account.usage).map(account => [account.id, account.usage!])))
    setStates(previous => Object.fromEntries(agents.map(agent => {
      const stored = snapshot.assignments.find(assignment => assignment.agentId === agent.id)
      const assignment = stored?.status === 'ready' ? { provider: stored.providerId, accountId: stored.accountId, model: stored.modelId, speed: stored.speed } : null
      return [agent.id, { assignment, running: previous[agent.id]?.running ?? false, sessionTokens: previous[agent.id]?.sessionTokens, sessionCost: previous[agent.id]?.sessionCost }]
    })))
  }

  useEffect(() => {
    void window.api.getProviderSnapshot().then(applySnapshot)
    return window.api.onProviderSnapshotChanged(applySnapshot)
  }, [agentKey])

  useEffect(() => window.api.onAgentAssignmentChanged(event => {
    if (!agents.some(agent => agent.id === event.agentId)) return
    const assignment = event.status === 'ready' ? { provider: event.providerId, accountId: event.accountId, model: event.modelId, speed: event.speed } : null
    setStates(previous => previous[event.agentId] ? { ...previous, [event.agentId]: { ...previous[event.agentId], assignment } } : previous)
  }), [agentKey])

  useEffect(() => {
    const refreshAssignment = (event: Event) => {
      const agentId = (event as CustomEvent<{ agentId?: string }>).detail?.agentId
      if (!agentId || !agents.some(agent => agent.id === agentId)) return
      void window.api.getProviderSnapshot().then(applySnapshot)
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
