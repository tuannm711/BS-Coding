import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentModelAssignment, ProviderQuotaGroup, ProviderUsage } from '@shared/types'
import { shouldAcceptSnapshot, type AgentAssignmentSnapshot, type ProviderAccountSnapshot, type ProviderSnapshot } from '@shared/provider-state'
import QuotaAccountCard from './quota/QuotaAccountCard'
import { chatQuotaGroups, quotaAccountState, type QuotaAccountUiState } from './quota/quota-view'

export interface QuotaAgent {
  id: string
  name: string
}

interface SessionTelemetry {
  running?: boolean
  sessionTokens?: { input: number; output: number }
  sessionCost?: number
}

export interface QuotaRow {
  key: string
  account?: ProviderAccountSnapshot
  usage?: ProviderUsage
  groups: ProviderQuotaGroup[]
  state: QuotaAccountUiState
  models: string[]
  agents: Array<{ id: string; name: string; assignment: AgentModelAssignment; modelLabel?: string; input: number; output: number; cost: number }>
  running: boolean
}

export function buildQuotaRows(agents: QuotaAgent[], snapshot: ProviderSnapshot | null, telemetry: Record<string, SessionTelemetry>): QuotaRow[] {
  if (!snapshot) return []
  const grouped = new Map<string, QuotaRow>()
  for (const agent of agents) {
    const stored = snapshot.assignments.find(assignment => assignment.agentId === agent.id && assignment.status === 'ready')
    if (!stored) continue
    const assignment: AgentModelAssignment = { provider: stored.providerId, accountId: stored.accountId, model: stored.modelId, speed: stored.speed }
    const key = stored.accountId ? `${stored.providerId}/${stored.accountId}` : `${stored.providerId}/${stored.modelId}`
    const account = stored.accountId ? snapshot.accounts.find(item => item.id === stored.accountId && item.providerId === stored.providerId) : undefined
    const current = grouped.get(key) ?? { key, account, usage: account?.usage, groups: [], state: quotaAccountState(account), models: [], agents: [], running: false }
    const local = telemetry[agent.id]
    const modelLabel = account?.models.find(model => model.id === stored.modelId)?.name
    current.models.push(stored.modelId)
    current.agents.push({ id: agent.id, name: agent.name, assignment, modelLabel, input: local?.sessionTokens?.input ?? 0, output: local?.sessionTokens?.output ?? 0, cost: local?.sessionCost ?? 0 })
    current.running ||= local?.running ?? false
    grouped.set(key, current)
  }
  return [...grouped.values()].map(row => {
    const models = [...new Set(row.models)]
    return { ...row, models, groups: chatQuotaGroups(row.usage, models) }
  })
}

export function mergeAssignmentEvent(snapshot: ProviderSnapshot, event: AgentAssignmentSnapshot): ProviderSnapshot {
  const current = snapshot.assignments.find(assignment => assignment.agentId === event.agentId)
  if (current && current.revision > event.revision) return snapshot
  return { ...snapshot, assignments: [...snapshot.assignments.filter(assignment => assignment.agentId !== event.agentId), event] }
}

export function quotaSelectedAgentLabel(rows: QuotaRow[]): string {
  return rows.flatMap(row => row.agents).map(agent => agent.modelLabel ?? agent.assignment.model).join(', ')
}

export default function RightPanelQuota({ agents }: { agents: QuotaAgent[] }) {
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null)
  const [telemetry, setTelemetry] = useState<Record<string, SessionTelemetry>>({})
  const snapshotRevision = useRef(0)
  const agentKey = agents.map(agent => agent.id).join('|')

  const applySnapshot = (next: ProviderSnapshot) => {
    if (!shouldAcceptSnapshot(snapshotRevision.current, next.revision)) return
    snapshotRevision.current = next.revision
    setSnapshot(next)
  }

  useEffect(() => {
    void window.api.getProviderSnapshot().then(applySnapshot)
    return window.api.onProviderSnapshotChanged(applySnapshot)
  }, [])

  useEffect(() => window.api.onAgentAssignmentChanged(event => {
    setSnapshot(previous => previous ? mergeAssignmentEvent(previous, event) : previous)
  }), [])

  useEffect(() => window.api.onChatEvent(event => {
    if (!agents.some(agent => agent.id === event.agentId)) return
    if (event.type === 'turn-started') {
      setTelemetry(previous => ({ ...previous, [event.agentId]: { ...previous[event.agentId], running: true } }))
    } else if (event.type === 'done' || event.type === 'error') {
      setTelemetry(previous => ({ ...previous, [event.agentId]: { ...previous[event.agentId], running: false } }))
    } else if (event.type === 'usage') {
      setTelemetry(previous => ({ ...previous, [event.agentId]: { ...previous[event.agentId], running: true, sessionTokens: event.sessionTokens, sessionCost: event.sessionCost } }))
    }
  }), [agentKey])

  const rows = useMemo(() => buildQuotaRows(agents, snapshot, telemetry), [agents, snapshot, telemetry])

  return (
    <section className="right-panel-quota" aria-label="Session model quota">
      <div className="right-panel-quota-header">
        <span>Session models</span>
        <span data-testid="quota-selected-agent">{quotaSelectedAgentLabel(rows) || 'No model selected'}</span>
      </div>
      <div className="right-panel-quota-list">
        {rows.length === 0 && <span className="right-panel-quota-empty">No active model in this session</span>}
        {rows.map(row => {
          const providerLabel = snapshot?.providers.find(provider => provider.id === row.account?.providerId)?.displayName
          const account = row.account ?? { id: row.key, providerId: row.agents[0]?.assignment.provider ?? 'provider', label: row.key, authMode: 'imported' as const, status: 'error' as const, models: [], updatedAt: 0 }
          const session = row.agents.reduce((total, agent) => ({ input: total.input + agent.input, output: total.output + agent.output, estimatedCost: total.estimatedCost + agent.cost }), { input: 0, output: 0, estimatedCost: 0 })
          return <QuotaAccountCard key={row.key} account={account} groups={row.groups} agents={row.agents} session={session} tracked={account.usage?.tracked} variant="chat" providerLabel={providerLabel} providerState={row.state} onSpeedChange={(agentId, speed) => {
            setSnapshot(previous => previous ? { ...previous, assignments: previous.assignments.map(assignment => assignment.agentId === agentId ? { ...assignment, speed } : assignment) } : previous)
            void window.api.setAgentSpeed(agentId, speed)
          }} />
        })}
      </div>
    </section>
  )
}
