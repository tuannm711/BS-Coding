import type { AgentModelAssignment, AgentRole, AgentSpeed, ProviderErrorState, ProviderQuotaGroup, ProviderTrackedUsage } from '@shared/types'
import type { ProviderAccountSnapshot } from '@shared/provider-state'
import type { FleetAgentRow, FleetPool } from '../fleet/fleet-model'
import { resetCreditGate } from '@shared/reset-credit'
import { poolState } from '@shared/quota-pool'
import { ChevronDown, Gauge, Hammer, Link2, Network, Power, RefreshCw, Trash2, Zap } from 'lucide-react'
import { accountWarning, formatAge, formatCountdown, formatCount, formatExpiry, formatInstant, formatMoney, formatPercent, formatProviderAccountType, quotaWindowState } from './quota-view'

export interface QuotaCardAgent {
  id: string
  name: string
  assignment?: AgentModelAssignment | null
  input?: number
  output?: number
  cost?: number
  modelLabel?: string
}

interface Props {
  account: ProviderAccountSnapshot
  groups: ProviderQuotaGroup[]
  providerLabel?: string
  tracked?: ProviderTrackedUsage
  session?: { input: number; output: number; estimatedCost: number }
  agents?: QuotaCardAgent[]
  // Fleet variant only: the agents nested inside the pool each one draws on.
  // The flat `agents` list above a separate list of groups is what hid the
  // fact that two models can share one pool.
  pools?: FleetPool[]
  strays?: FleetAgentRow[]
  coordinatorName?: string
  onSetRole?: (agentId: string, role: AgentRole) => void
  onSelectAgent?: (agentId: string) => void
  variant: 'provider' | 'chat' | 'fleet'
  providerState?: 'ready' | 'unavailable' | 'quota-exhausted' | 'capacity-exhausted' | 'cooldown' | 'auth-error'
  expandedModels?: boolean
  refreshing?: boolean
  onToggleModels?: () => void
  onRefresh?: () => void
  onReconnect?: () => void
  onAccountToggle?: () => void
  onRemove?: () => void
  onSpeedChange?: (agentId: string, speed: AgentSpeed) => void
  onConsumeResetCredit?: () => void
}

const resetCreditLabel = (available: number): string => `${available} reset${available === 1 ? '' : 's'}`

// One agent inside the pool it draws on. The speed control is the same one the
// chat variant carries — moving the panel must not drop a function.
function FleetAgent({ agent, coordinatorName, onSelect, onSpeedChange, onSetRole }: {
  agent: FleetAgentRow
  coordinatorName?: string
  onSelect?: (agentId: string) => void
  onSpeedChange?: (agentId: string, speed: AgentSpeed) => void
  onSetRole?: (agentId: string, role: AgentRole) => void
}) {
  return (
    <div className={`fleet-agent${agent.role === 'coordinator' ? ' coordinator' : ''}`}>
      <button className="fleet-agent-name" type="button" onClick={() => onSelect?.(agent.id)} title={`Open ${agent.name}`}>
        <strong>{agent.name}</strong>
        <code title={agent.modelId}>{agent.modelLabel ?? agent.modelId ?? 'Model not assigned'}</code>
      </button>
      {agent.mode === 'plan' ? <span className="fleet-role plan">plan</span> : null}
      {/* Icons, not words: three labelled controls left no room for the agent's
          own name. Both are real toggles and neither is ever disabled or
          hidden — pressing the lit one returns the agent to no role. The first
          version disabled the coordinator control once held and hid the worker
          control behind it, which made the press a one-way door. */}
      <button
        type="button"
        className={`fleet-toggle${agent.role === 'coordinator' ? ' on' : ''}`}
        aria-pressed={agent.role === 'coordinator'}
        aria-label={`Coordinator: ${agent.name}`}
        title={agent.role === 'coordinator'
          ? 'Coordinates this project — click to release'
          : coordinatorName ? `Coordinate — takes the role from ${coordinatorName}` : 'Make this agent the coordinator'}
        onClick={() => onSetRole?.(agent.id, agent.role === 'coordinator' ? 'none' : 'coordinator')}
      ><Network size={12} aria-hidden="true" /></button>
      <button
        type="button"
        className={`fleet-toggle${agent.role === 'worker' ? ' on' : ''}`}
        aria-pressed={agent.role === 'worker'}
        aria-label={`Can be assigned work: ${agent.name}`}
        title={agent.role === 'worker'
          ? 'Can be assigned work — click to exclude'
          : 'Excluded from assignment — click to include'}
        onClick={() => onSetRole?.(agent.id, agent.role === 'worker' ? 'none' : 'worker')}
      ><Hammer size={12} aria-hidden="true" /></button>
      {/* One toggle, not two buttons. At this width two labelled buttons push
          the agent's own name out of the row, which is the one thing the row
          exists to show. Standard is the unlit state. */}
      <button
        type="button"
        className={`fleet-speed${agent.speed === 'fast' ? ' fast' : ''}`}
        aria-pressed={agent.speed === 'fast'}
        aria-label={`Fast mode for ${agent.name}`}
        title={agent.speed === 'fast' ? 'Fast — click for standard' : 'Standard — click for fast'}
        onClick={() => onSpeedChange?.(agent.id, agent.speed === 'fast' ? 'standard' : 'fast')}
      ><Zap size={12} aria-hidden="true" /></button>
    </div>
  )
}

const STATE_LABELS = { ready: 'Ready', unavailable: 'Usage unavailable', 'quota-exhausted': 'Quota exhausted', 'capacity-exhausted': 'Capacity exhausted', cooldown: 'Cooldown', 'auth-error': 'Auth error' } as const

export default function QuotaAccountCard({
  account, groups, providerLabel, tracked, session, agents = [], variant, providerState,
  pools = [], strays = [], onSelectAgent, onSetRole, coordinatorName,
  expandedModels = false, refreshing = false, onToggleModels, onRefresh, onReconnect, onConsumeResetCredit,
  onAccountToggle, onRemove, onSpeedChange
}: Props) {
  const usage = account.usage
  const accountLabel = account.profile?.email ?? account.profile?.name ?? account.label
  const planName = usage?.planName ?? account.profile?.planName
  const accountType = formatProviderAccountType(account.providerId, account.authMode)
  const active = account.status === 'active'
  const resetGate = resetCreditGate(usage)
  const modelNames = account.models.map(model => model.name)
  const stageDetails = Object.entries(account.refreshStages ?? {}).filter(([, status]) => status === 'refreshing' || status === 'error')

  return (
    <section className={`quota-account-card ${variant}`} aria-label={`Quota for ${accountLabel}`}>
      {variant === 'fleet' ? <header className="quota-account-head">
        {/* Three fixed lines that never wrap: who, where from, how it stands.
            The avatar sat alone on its own line because the identity block was
            allowed to wrap at this width. */}
        <div className="quota-head-identity">
          <span className="quota-account-avatar" aria-hidden="true">{accountLabel.slice(0, 1).toUpperCase()}</span>
          <strong title={accountLabel}>{accountLabel}</strong>
          {onRefresh ? <button
            className="quota-account-refresh"
            type="button"
            disabled={refreshing}
            title={refreshing ? 'Refreshing…' : 'Refresh quota'}
            aria-label={`Refresh quota for ${accountLabel}`}
            onClick={onRefresh}
          ><RefreshCw size={13} aria-hidden="true" className={refreshing ? 'spinning' : undefined} /></button> : null}
        </div>
        <div className="quota-head-source">
          {providerLabel ?? account.providerId} · {accountType}{planName ? ` · ${planName}` : ''}
        </div>
        {/* Still badges, only tighter. Flattening them to plain text to save
            width took the one thing that made state readable at a glance —
            the shape and colour — and left three grey words. */}
        <div className="quota-head-state">
          <span
            className={`quota-plan-badge quota-badge-tight quota-state-${providerState ?? (active ? 'ready' : 'unavailable')}`}
            role="status"
          >{active ? STATE_LABELS[providerState ?? 'ready'] : account.status}</span>
          {usage?.resetCredits ? (onConsumeResetCredit
            ? <button
                className="quota-plan-badge quota-badge-tight quota-reset-badge"
                type="button"
                disabled={!resetGate.allowed}
                title={resetGate.allowed ? 'Spend one reset credit' : resetGate.reason}
                onClick={onConsumeResetCredit}
              >{resetCreditLabel(usage.resetCredits.available)}</button>
            : <span className="quota-plan-badge quota-badge-tight quota-reset-badge" role="status">{resetCreditLabel(usage.resetCredits.available)}</span>
          ) : null}
          <span
            className="quota-age"
            title={usage?.subscriptionExpiresAt ? formatExpiry(usage.subscriptionExpiresAt) : 'Subscription expiry not reported'}
          >{usage?.stale ? `stale ${formatAge(usage.lastSuccessfulRefreshAt ?? usage.refreshedAt)}` : formatAge(usage?.refreshedAt)}</span>
        </div>
      </header> : <>
      <header className="quota-account-header">
        <div className="quota-account-identity">
          <span className="quota-account-avatar" aria-hidden="true">{accountLabel.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong title={accountLabel}>{accountLabel}</strong>
            <span>{providerLabel ?? account.providerId} · {accountType}</span>
          </div>
        </div>
        <div className="quota-account-badges">
          <span className={`quota-account-status ${active ? 'active' : 'inactive'}`}>{active ? 'Active' : account.status}</span>
          {planName ? <span className="quota-plan-badge">{planName}</span> : null}
          {providerState ? <span className={`quota-plan-badge quota-state-${providerState}`} role="status">{STATE_LABELS[providerState]}</span> : null}
          {/* The count, and nothing about what it means: cockpit spends these
              successfully while ignoring applicable_available_count, so any
              claim built on that field is unsupported. */}
          {usage?.resetCredits ? (onConsumeResetCredit
            ? <button
                className="quota-plan-badge quota-reset-badge"
                type="button"
                disabled={!resetGate.allowed}
                title={resetGate.allowed ? 'Spend one reset credit' : resetGate.reason}
                onClick={onConsumeResetCredit}
              >{resetCreditLabel(usage.resetCredits.available)}</button>
            : <span className="quota-plan-badge quota-reset-badge" role="status">{resetCreditLabel(usage.resetCredits.available)}</span>
          ) : null}
        </div>
      </header>

      <div className="quota-account-subline">
        <span>{usage?.subscriptionExpiresAt ? formatExpiry(usage.subscriptionExpiresAt) : 'Subscription expiry not reported'}</span>
        <span>{usage?.stale ? `Stale · ${formatAge(usage.lastSuccessfulRefreshAt ?? usage.refreshedAt)}` : `Updated ${formatAge(usage?.refreshedAt)}`}</span>
      </div>

      </>}

      {stageDetails.length > 0 ? <div className="provider-refresh-stages" aria-label={`Refresh stages for ${accountLabel}`}>
        {stageDetails.map(([stage, status]) => <span key={stage} className={`provider-refresh-stage ${status}`}>{stage} · {status}</span>)}
      </div> : null}
      {accountWarning(usage) ? <div className="quota-account-error" role="status">{accountWarning(usage)}</div> : null}

      {variant === 'provider' ? <div className="quota-model-summary">
        <span><strong>{account.models.length}</strong> code model{account.models.length === 1 ? '' : 's'}{modelNames.length > 0 ? ` · ${modelNames.slice(0, 3).join(' · ')}` : ''}</span>
        {account.models.length > 0 ? <button className="btn small quota-model-toggle" type="button" aria-expanded={expandedModels} onClick={onToggleModels}>View <ChevronDown size={13} aria-hidden="true" /></button> : null}
        {expandedModels ? <div className="quota-model-list">{account.models.map(model => <code key={model.id} title={model.id}>{model.name}</code>)}</div> : null}
      </div> : null}

      {variant !== 'fleet' && agents.length > 0 ? <div className="quota-agent-list">
        {agents.map(agent => <div className="quota-agent-row" key={agent.id}>
          <span className="quota-agent-name"><strong>{agent.name}</strong><code title={agent.assignment?.model}>{agent.modelLabel ?? agent.assignment?.model ?? 'Model not assigned'}</code></span>
          <span className="quota-speed-control" role="group" aria-label={`Speed for ${agent.name}`}>
            {(['standard', 'fast'] as const).map(speed => {
              const selected = agent.assignment?.speed === speed || (!agent.assignment?.speed && speed === 'standard')
              return <button key={speed} type="button" className={selected ? 'active' : ''} aria-pressed={selected} onClick={() => onSpeedChange?.(agent.id, speed)}>
                {speed === 'fast' ? <Zap size={12} aria-hidden="true" /> : <Gauge size={12} aria-hidden="true" />}{speed === 'fast' ? 'Fast' : 'Standard'}
              </button>
            })}
          </span>
        </div>)}
      </div> : null}

      {variant === 'fleet' ? <div className="quota-groups">
        {pools.length === 0 ? <div className="quota-empty">Quota not reported by provider</div> : null}
        {pools.map(pool => <section className="quota-group" key={pool.group.id} aria-label={pool.group.label}>
          <h6>{pool.group.label}<PoolBadge group={pool.group} poolErrors={account.poolErrors} /></h6>
          {pool.group.windows.map(window => <QuotaWindow key={window.id} window={window} />)}
          {/* No "nobody is using this pool" line. It repeated under every idle
              pool and said nothing the empty space did not already say. */}
          {pool.agents.length > 0 ? <div className="fleet-pool-agents">
            {pool.agents.map(agent => <FleetAgent
              key={agent.id} agent={agent}
              onSelect={onSelectAgent} onSpeedChange={onSpeedChange}
              onSetRole={onSetRole} coordinatorName={coordinatorName} />)}
          </div> : null}
        </section>)}
      </div> : groups.length > 0 ? <div className="quota-groups">
        {groups.map(group => <section className="quota-group" key={group.id} aria-label={group.label}>
          <h6>{group.label}<PoolBadge group={group} poolErrors={account.poolErrors} /></h6>
          {group.windows.map(window => <QuotaWindow key={window.id} window={window} />)}
        </section>)}
      </div> : <div className="quota-empty">Quota not reported by provider</div>}

      {/* Same margin as an agent under a pool. The dashed box these used to
          sit in inset them a second time, which is why the card holding them
          looked narrower than its neighbours. */}
      {variant === 'fleet' && strays.length > 0 ? <section className="quota-group" aria-label="No quota reported">
        <h6>No quota reported</h6>
        <div className="fleet-pool-agents">
          {strays.map(agent => <FleetAgent
            key={agent.id} agent={agent}
            onSelect={onSelectAgent} onSpeedChange={onSpeedChange}
            onSetRole={onSetRole} coordinatorName={coordinatorName} />)}
        </div>
      </section> : null}

      {/* Nothing for the fleet variant. It is given no telemetry, so the row
          rendered four truncated labels over four dashes — a heading for a
          measurement that is not there. */}
      {variant === 'provider' ? <ProviderMetrics tracked={tracked} />
        : variant === 'chat' ? <SessionMetrics session={session} tracked={tracked} />
        : null}

      {variant === 'provider' ? <footer className="quota-card-actions">
        <button className="btn small" type="button" disabled={refreshing} onClick={onRefresh}><RefreshCw size={13} aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
        <button className="btn small" type="button" disabled={refreshing} onClick={onReconnect}><Link2 size={13} aria-hidden="true" />Reconnect</button>
        <button className={`btn small ${active ? 'danger' : ''}`} type="button" disabled={refreshing} onClick={onAccountToggle}><Power size={13} aria-hidden="true" />{active ? 'Deactivate' : 'Activate'}</button>
        <button className="btn small danger" type="button" disabled={refreshing} onClick={onRemove}><Trash2 size={13} aria-hidden="true" />Remove</button>
      </footer> : null}

      {variant === 'chat' && onRefresh ? <footer className="quota-card-actions">
        <button className="btn small" type="button" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={13} aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </footer> : null}
    </section>
  )
}

function PoolBadge({ group, poolErrors }: { group: ProviderQuotaGroup; poolErrors?: Record<string, ProviderErrorState> }) {
  const state = poolState(group, poolErrors)
  if (state === 'ok') return null
  return <span className="quota-pool-error" role="status">{STATE_LABELS[state]}</span>
}

function QuotaWindow({ window }: { window: ProviderQuotaGroup['windows'][number] }) {
  const known = window.usageKnown && window.remainingPercent !== undefined
  const state = quotaWindowState(window)
  // One line, then the bar. The percentage, the bar and the countdown are the
  // same fact three ways; the absolute timestamp and the provider's sentence
  // are wanted occasionally, so they hang off the row rather than filling it.
  const detail = [
    window.description,
    window.resetAt ? `Next reset ${formatInstant(window.resetAt)}` : 'Reset not reported'
  ].filter(Boolean).join('\n')
  return <div className={`quota-window state-${state}`} title={detail}>
    <div className="quota-window-label">
      <span>{window.label}</span>
      <em>{window.resetAt ? formatCountdown(window.resetAt) : '—'}</em>
      <strong>{known ? formatPercent(window.remainingPercent) : '—'}</strong>
    </div>
    {known ? <div className="quota-progress" role="progressbar" aria-label={`${window.label} remaining`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={window.remainingPercent}><span style={{ width: `${window.remainingPercent}%` }} /></div> : null}
  </div>
}

function ProviderMetrics({ tracked }: { tracked?: ProviderTrackedUsage }) {
  if (!tracked) return <div className="quota-empty">BS usage not tracked yet</div>
  return <div className="quota-metrics">
    <span className="quota-metrics-source">BS tracked</span>
    <Metric label="Requests" value={formatCount(tracked.requests)} />
    <Metric label="Token in" value={formatCount(tracked.tokensInput)} />
    <Metric label="Token out" value={formatCount(tracked.tokensOutput)} />
    <Metric label="Estimated" value={formatMoney(tracked.estimatedBilled)} />
  </div>
}

function SessionMetrics({ session, tracked }: { session?: Props['session']; tracked?: ProviderTrackedUsage }) {
  return <div className="quota-metrics">
    <span className="quota-metrics-source">Session estimate</span>
    <Metric label="Requests" value={formatCount(tracked?.requests)} />
    <Metric label="Token in" value={formatCount(session?.input ?? 0)} />
    <Metric label="Token out" value={formatCount(session?.output ?? 0)} />
    <Metric label="Estimated" value={formatMoney(session?.estimatedCost ?? 0)} />
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <span className="quota-metric"><small>{label}</small><strong>{value}</strong></span>
}
