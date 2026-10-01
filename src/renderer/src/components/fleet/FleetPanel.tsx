import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProviderSnapshot } from '@shared/provider-state'
import { shouldAcceptSnapshot } from '@shared/provider-state'
import type { AgentConfig, AgentRole, AgentSpeed } from '@shared/types'
import { FleetAgent, QuotaWindow } from '../quota/QuotaAccountCard'
import { RefreshCw } from 'lucide-react'
import { poolState } from '@shared/quota-pool'
import { resetCreditGate } from '@shared/reset-credit'
import { formatProviderAccountType } from '../quota/quota-view'
import ResetCreditDialog from '../quota/ResetCreditDialog'
import { mergeAssignmentEvent } from '../RightPanelQuota'
import { buildFleet, type FleetModel } from './fleet-model'

export interface FleetBoardProps {
  fleet: FleetModel
  providerLabel: (providerId: string) => string | undefined
  refreshingId: string | null
  onSelectAgent: (agentId: string) => void
  onSetRole: (agentId: string, role: AgentRole) => void
  onSpeedChange: (agentId: string, speed: AgentSpeed) => void
  onRefresh: (providerId: string, accountId: string) => void
  onConsumeResetCredit: (account: { id: string; providerId: string; label: string; available: number }) => void
}

// Presentational half, so every state can be asserted with renderToStaticMarkup
// the way CoordinatorBoard and StatsView are.
export function FleetBoard({
  fleet, providerLabel, refreshingId, onSelectAgent, onSetRole, onSpeedChange, onRefresh, onConsumeResetCredit
}: FleetBoardProps) {
  if (fleet.accounts.length === 0 && fleet.unassigned.length === 0) {
    return (
      <div className="fleet-empty">
        <p>No agents in this project.</p>
        <p className="settings-hint">Add one to see what it runs and how much quota it has left.</p>
      </div>
    )
  }

  // Named on the button that would take the role, so the demotion is visible
  // before it happens rather than discovered afterwards.
  const coordinatorName = fleet.accounts
    .flatMap(section => [...section.pools.flatMap(pool => pool.agents), ...section.strays])
    .concat(fleet.unassigned)
    .find(agent => agent.role === 'coordinator')?.name

  const entries = fleet.accounts.flatMap(section => [
    ...section.pools.flatMap(pool => pool.agents.map(agent => ({ section, agent, groups: [pool.group], conflict: pool.agents.length > 1 }))),
    ...section.strays.map(agent => ({ section, agent, groups: section.account.providerId === 'antigravity' ? [] : section.pools.map(pool => pool.group), conflict: false }))
  ]).sort((a, b) => a.agent.name.localeCompare(b.agent.name))

  return (
    <div className="fleet-board">
      {entries.map(({ section, agent, groups, conflict }) => {
        const account = section.account
        const accountLabel = account.profile?.email ?? account.profile?.name ?? account.label
        const resetGate = resetCreditGate(account.usage)
        const blocked = groups.map(group => poolState(group, account.poolErrors)).find(state => state !== 'ok')
        const refreshError = account.usage?.refreshError
        return <section key={agent.id} className="fleet-agent-card" aria-label={`Agent ${agent.name}`}>
          <FleetAgent agent={agent} coordinatorName={coordinatorName} onSelect={onSelectAgent} onSetRole={onSetRole} onSpeedChange={onSpeedChange} />
          <div className="fleet-agent-source" title={`${providerLabel(account.providerId) ?? account.providerId} · ${formatProviderAccountType(account.providerId, account.authMode)} · ${accountLabel}`}>
            <span>{providerLabel(account.providerId) ?? account.providerId} · {accountLabel}</span>
            <button type="button" className="quota-account-refresh" aria-label={`Refresh quota for ${agent.name}`} title="Refresh quota" disabled={refreshingId === account.id} onClick={() => onRefresh(account.providerId, account.id)}><RefreshCw size={12} aria-hidden="true" className={refreshingId === account.id ? 'spinning' : undefined} /></button>
          </div>
          {conflict && <p className="fleet-agent-warning" role="alert">Quota conflict · Review in Settings</p>}
          {blocked && <p className="fleet-agent-warning" role="status">{blocked === 'quota-exhausted' ? 'Quota exhausted' : 'Capacity exhausted'}</p>}
          {account.status !== 'active' && <p className="fleet-agent-warning" role="status">Account {account.status}</p>}
          {account.error?.kind === 'auth' && <p className="fleet-agent-warning" role="status">Authentication required · Reconnect in Settings</p>}
          {account.usage?.stale && <p className="fleet-agent-warning" role="status">Quota data is stale · Refresh to update</p>}
          {refreshError && <p className="fleet-agent-warning" role="status">{refreshError}</p>}
          {groups.length ? groups.map(group => <section className="fleet-agent-quota" key={group.id} aria-label={group.label}>
            <h6>{group.label}</h6>
            {group.windows.map(window => <QuotaWindow key={window.id} window={window} />)}
            {!group.windows.length && <span className="settings-hint">Quota not reported</span>}
          </section>) : <p className="settings-hint">Quota not reported</p>}
          {account.usage?.resetCredits && <button type="button" className="quota-plan-badge quota-reset-badge" disabled={!resetGate.allowed} title={resetGate.allowed ? 'Spend one reset credit' : resetGate.reason}
            onClick={() => onConsumeResetCredit({ id: account.id, providerId: account.providerId, label: accountLabel, available: account.usage!.resetCredits!.available })}>{account.usage.resetCredits.available} resets</button>}
        </section>
      })}

      {fleet.unassigned.length > 0 ? (
        <div className="fleet-unassigned-list" aria-label="Unassigned agents">
          {fleet.unassigned.map(agent => (
            <section key={agent.id} className="fleet-agent-card" aria-label={`Agent ${agent.name}`}>
              <FleetAgent agent={agent} coordinatorName={coordinatorName} onSelect={onSelectAgent} onSetRole={onSetRole} onSpeedChange={onSpeedChange} />
              <p className="settings-hint">Unassigned · Choose an account quota in Settings → Agents.</p>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function FleetPanel({ agents, onSelectAgent, onSetRole }: {
  agents: AgentConfig[]
  onSelectAgent: (agentId: string) => void
  onSetRole: (agentId: string, role: AgentRole) => void
}) {
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<{ id: string; providerId: string; label: string; available: number } | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetNote, setResetNote] = useState<string | null>(null)
  const [error, setError] = useState('')
  const snapshotRevision = useRef(0)

  const applySnapshot = (next: ProviderSnapshot) => {
    if (!shouldAcceptSnapshot(snapshotRevision.current, next.revision)) return
    snapshotRevision.current = next.revision
    setSnapshot(next)
  }

  useEffect(() => {
    void window.api.getProviderSnapshot().then(applySnapshot).catch(err => setError(String(err)))
    return window.api.onProviderSnapshotChanged(applySnapshot)
  }, [])

  useEffect(() => window.api.onAgentAssignmentChanged(event => {
    setSnapshot(previous => previous ? mergeAssignmentEvent(previous, event) : previous)
  }), [])

  const fleet = useMemo(() => buildFleet(agents, snapshot), [agents, snapshot])

  return (
    <section className="fleet-panel" aria-label="Fleet">
      <FleetBoard
        fleet={fleet}
        refreshingId={refreshingId}
        providerLabel={providerId => snapshot?.providers.find(provider => provider.id === providerId)?.displayName}
        onSelectAgent={onSelectAgent}
        onSetRole={onSetRole}
        onSpeedChange={(agentId, speed) => {
          setSnapshot(previous => previous ? { ...previous, assignments: previous.assignments.map(assignment => assignment.agentId === agentId ? { ...assignment, speed } : assignment) } : previous)
          void window.api.setAgentSpeed(agentId, speed)
            .catch(err => { setError(String(err)); void window.api.getProviderSnapshot().then(applySnapshot) })
        }}
        onRefresh={(providerId, accountId) => {
          setRefreshingId(accountId)
          // finally, not then: a failed refresh must not leave the button
          // disabled until the app is restarted.
          void window.api.refreshProviderAccount(providerId, accountId)
            .then(applySnapshot)
            .catch(err => setError(String(err)))
            .finally(() => setRefreshingId(null))
        }}
        onConsumeResetCredit={setResetTarget}
      />
      {error && <p className="fleet-agent-warning" role="alert">{error}</p>}
      {resetNote ? <div className="right-panel-quota-note" role="status">{resetNote}</div> : null}
      {resetTarget ? <ResetCreditDialog
        accountLabel={resetTarget.label}
        available={resetTarget.available}
        busy={resetBusy}
        onClose={() => setResetTarget(null)}
        onConfirm={() => {
          setResetBusy(true)
          void window.api.consumeResetCredit(resetTarget.providerId, resetTarget.id)
            .then(result => {
              // 'consumed' with a refreshError is not a failure: the credit is
              // gone, and telling the user to retry would spend another.
              if (result.status === 'consumed') {
                setResetNote(result.refreshError
                  ? `Credit spent. Quota could not be re-read: ${result.refreshError}`
                  : 'Quota reset.')
              } else if (result.status === 'refused') setResetNote(result.reason)
              else setResetNote(`Reset failed: ${result.error}`)
              setResetTarget(null)
            })
            .catch(err => setError(String(err)))
            .finally(() => setResetBusy(false))
        }}
      /> : null}
    </section>
  )
}
