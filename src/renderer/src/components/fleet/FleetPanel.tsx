import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProviderSnapshot } from '@shared/provider-state'
import { shouldAcceptSnapshot } from '@shared/provider-state'
import type { AgentConfig, AgentSpeed } from '@shared/types'
import QuotaAccountCard from '../quota/QuotaAccountCard'
import ResetCreditDialog from '../quota/ResetCreditDialog'
import { mergeAssignmentEvent } from '../RightPanelQuota'
import { buildFleet, type FleetModel } from './fleet-model'

export interface FleetBoardProps {
  fleet: FleetModel
  providerLabel: (providerId: string) => string | undefined
  refreshingId: string | null
  onSelectAgent: (agentId: string) => void
  onSetCoordinator: (agentId: string) => void
  onSpeedChange: (agentId: string, speed: AgentSpeed) => void
  onRefresh: (providerId: string, accountId: string) => void
  onConsumeResetCredit: (account: { id: string; providerId: string; label: string; available: number }) => void
}

// Presentational half, so every state can be asserted with renderToStaticMarkup
// the way CoordinatorBoard and StatsView are.
export function FleetBoard({
  fleet, providerLabel, refreshingId, onSelectAgent, onSetCoordinator, onSpeedChange, onRefresh, onConsumeResetCredit
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
    .find(agent => agent.coordinator)?.name

  return (
    <div className="fleet-board">
      {fleet.accounts.map(section => (
        <QuotaAccountCard
          key={section.key}
          variant="fleet"
          account={section.account}
          groups={[]}
          pools={section.pools}
          strays={section.strays}
          providerLabel={providerLabel(section.account.providerId)}
          providerState={section.state}
          tracked={section.account.usage?.tracked}
          refreshing={refreshingId === section.account.id}
          onSelectAgent={onSelectAgent}
          onSetCoordinator={onSetCoordinator}
          coordinatorName={coordinatorName}
          onSpeedChange={onSpeedChange}
          onRefresh={() => onRefresh(section.account.providerId, section.account.id)}
          onConsumeResetCredit={section.account.usage?.resetCredits
            ? () => onConsumeResetCredit({
              id: section.account.id,
              providerId: section.account.providerId,
              label: section.account.label,
              available: section.account.usage!.resetCredits!.available
            })
            : undefined}
        />
      ))}

      {fleet.unassigned.length > 0 ? (
        <section className="fleet-unassigned" aria-label="Unassigned agents">
          <h6>Unassigned</h6>
          <p className="settings-hint">No account yet, so no quota to draw on.</p>
          {fleet.unassigned.map(agent => (
            <button key={agent.id} className="fleet-agent-name" type="button" onClick={() => onSelectAgent(agent.id)}>
              <strong>{agent.name}</strong>
              <code>{agent.modelLabel ?? agent.modelId ?? 'Model not assigned'}</code>
            </button>
          ))}
        </section>
      ) : null}
    </div>
  )
}

export default function FleetPanel({ agents, onSelectAgent, onSetCoordinator }: {
  agents: AgentConfig[]
  onSelectAgent: (agentId: string) => void
  onSetCoordinator: (agentId: string) => void
}) {
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<{ id: string; providerId: string; label: string; available: number } | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetNote, setResetNote] = useState<string | null>(null)
  const snapshotRevision = useRef(0)

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

  const fleet = useMemo(() => buildFleet(agents, snapshot), [agents, snapshot])

  return (
    <section className="fleet-panel" aria-label="Fleet">
      <FleetBoard
        fleet={fleet}
        refreshingId={refreshingId}
        providerLabel={providerId => snapshot?.providers.find(provider => provider.id === providerId)?.displayName}
        onSelectAgent={onSelectAgent}
        onSetCoordinator={onSetCoordinator}
        onSpeedChange={(agentId, speed) => {
          setSnapshot(previous => previous ? { ...previous, assignments: previous.assignments.map(assignment => assignment.agentId === agentId ? { ...assignment, speed } : assignment) } : previous)
          void window.api.setAgentSpeed(agentId, speed)
        }}
        onRefresh={(providerId, accountId) => {
          setRefreshingId(accountId)
          // finally, not then: a failed refresh must not leave the button
          // disabled until the app is restarted.
          void window.api.refreshProviderAccount(providerId, accountId)
            .then(applySnapshot)
            .finally(() => setRefreshingId(null))
        }}
        onConsumeResetCredit={setResetTarget}
      />
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
            .finally(() => setResetBusy(false))
        }}
      /> : null}
    </section>
  )
}
