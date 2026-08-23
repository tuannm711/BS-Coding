import type { AgentModelAssignment, AgentSpeed, ProviderUsage } from '@shared/types'
import { Gauge, RefreshCw, Zap } from 'lucide-react'
import { formatAge, formatCountdown, formatCount, formatExpiry, formatMoney, formatPercent, formatProviderAccountType, usageRemaining } from './quota-view'

export interface QuotaCardAgent {
  id: string
  name: string
  assignment?: AgentModelAssignment | null
  input?: number
  output?: number
  cost?: number
}

interface Props {
  usage?: ProviderUsage
  agents?: QuotaCardAgent[]
  onRefresh?: () => void
  onSpeedChange?: (agentId: string, speed: AgentSpeed) => void
  accountStatus?: 'active' | 'inactive'
  onAccountToggle?: (enabled: boolean) => void
  providerLabel?: string
  compact?: boolean
}

export default function QuotaAccountCard({ usage, agents = [], onRefresh, onSpeedChange, accountStatus, onAccountToggle, providerLabel, compact = false }: Props) {
  const remaining = usageRemaining(usage)
  const accountLabel = usage?.accountLabel ?? 'ChatGPT account'
  const accountType = formatProviderAccountType(providerLabel, usage?.accountType)
  const local = agents.reduce((sum, agent) => ({ input: sum.input + (agent.input ?? 0), output: sum.output + (agent.output ?? 0), cost: sum.cost + (agent.cost ?? 0) }), { input: 0, output: 0, cost: 0 })
  const input = usage?.tokensInput ?? (local.input || undefined)
  const output = usage?.tokensOutput ?? (local.output || undefined)
  const billed = usage?.estimatedBilled ?? (local.cost || undefined)

  return (
    <section className={`quota-account-card ${compact ? 'compact' : ''}`} aria-label={`Quota for ${accountLabel}`}>
      <header className="quota-account-header">
        <div className="quota-account-identity">
          <span className="quota-account-avatar" aria-hidden="true">{accountLabel.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong title={accountLabel}>{providerLabel ? `${providerLabel} · ` : ''}{accountLabel}</strong>
            <span>{accountType} · {usage?.planName ?? 'Plan —'}</span>
          </div>
        </div>
        <div className="quota-account-actions">
          {accountStatus && <><span className={`quota-account-status ${accountStatus}`}>{accountStatus === 'active' ? '● Active' : '● Inactive'}</span><button className={`btn small ${accountStatus === 'active' ? 'danger' : ''}`} onClick={() => onAccountToggle?.(accountStatus !== 'active')}>{accountStatus === 'active' ? 'Deactivate' : 'Activate'}</button></>}
          <span className="quota-plan-badge">{usage?.planName ?? '—'}</span>
          {onRefresh && <button className="icon-btn quota-refresh" aria-label="Refresh quota" title="Refresh quota" onClick={onRefresh}><RefreshCw size={14} /></button>}
        </div>
      </header>
      <div className="quota-account-subline">{usage?.subscriptionExpiresAt ? formatExpiry(usage.subscriptionExpiresAt) : 'Subscription expiry —'} · updated {formatAge(usage?.refreshedAt)}</div>
      {usage?.unavailableReason && <div className="quota-account-error" role="status">{usage.unavailableReason}{onRefresh && <button className="btn small" onClick={onRefresh}>Retry</button>}</div>}

      {agents.length > 0 && <div className="quota-agent-list">
        {agents.map(agent => <div className="quota-agent-row" key={agent.id}>
          <span className="quota-agent-name">{agent.name} <code>{agent.assignment?.model ?? '—'}</code></span>
          <span className="quota-speed-control" role="group" aria-label={`Speed for ${agent.name}`}>
            {(['standard', 'fast'] as const).map(speed => <button key={speed} className={agent.assignment?.speed === speed || (!agent.assignment?.speed && speed === 'standard') ? 'active' : ''} aria-pressed={agent.assignment?.speed === speed || (!agent.assignment?.speed && speed === 'standard')} onClick={() => onSpeedChange?.(agent.id, speed)}><span>{speed === 'fast' ? <Zap size={12} /> : <Gauge size={12} />}</span>{speed === 'fast' ? 'Fast' : 'Standard'}</button>)}
          </span>
        </div>)}
      </div>}

      <QuotaWindow label="5-hour window" remaining={remaining.primary} resetAt={usage?.resetAt} />
      <QuotaWindow label="Weekly window" remaining={remaining.secondary} resetAt={usage?.secondaryResetAt} />

      <div className="quota-usage-grid">
        <Metric label="Requests" value={formatCount(usage?.requestsUsed)} />
        <Metric label="Token in" value={formatCount(input)} />
        <Metric label="Token out" value={formatCount(output)} />
        <Metric label="Account billed" value={formatMoney(billed)} />
      </div>
    </section>
  )
}

function QuotaWindow({ label, remaining, resetAt }: { label: string; remaining?: number; resetAt?: number }) {
  return <div className="quota-window">
    <div className="quota-window-label"><span>{label}</span><strong>{formatPercent(remaining)} left</strong></div>
    <div className="quota-progress" role="progressbar" aria-label={`${label} remaining`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={remaining ?? 0}><span style={{ width: `${remaining ?? 0}%` }} /></div>
    <span className="quota-window-reset">Next reset · {formatCountdown(resetAt)}</span>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="quota-metric"><span>{label}</span><strong>{value}</strong></div>
}
