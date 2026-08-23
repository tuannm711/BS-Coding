import { useEffect, useState } from 'react'
import type { AgentModelAssignment, ProviderUsage } from '@shared/types'

interface Props {
  agentId: string
  running: boolean
  contextUsed: number | null
  contextLimit: number | null
  compactThreshold: number | null
  sessionTokens: { input: number; output: number } | null
  onStop: () => void
}

export default function AgentUsageCard({ agentId, running, contextUsed, contextLimit, compactThreshold, sessionTokens, onStop }: Props) {
  const [assignment, setAssignment] = useState<AgentModelAssignment | null>(null)
  const [usage, setUsage] = useState<ProviderUsage | null>(null)
  useEffect(() => { void window.api.getAgentAssignment(agentId).then(setAssignment) }, [agentId])
  useEffect(() => window.api.onProviderUsage(next => {
    if (assignment?.accountId && next.accountId === assignment.accountId) setUsage(next)
  }), [assignment?.accountId])
  const pct = contextUsed !== null && contextLimit ? Math.round((contextUsed / contextLimit) * 100) : null
  return (
    <section className="agent-usage-card" aria-label={`${agentId} usage`}>
      <div className="agent-usage-card-header">
        <span>{assignment ? `${assignment.provider} · ${assignment.model}` : 'Provider assignment loading…'}</span>
        <span className={`agent-usage-status ${running ? 'running' : 'idle'}`}>{running ? 'Running' : 'Idle'}</span>
      </div>
      <div className="agent-usage-card-grid">
        <span>Context {contextUsed ?? 0}{contextLimit ? ` / ${contextLimit}` : ''}{pct !== null ? ` (${pct}%)` : ''}</span>
        <span>Session {sessionTokens ? `${sessionTokens.input.toLocaleString()} in · ${sessionTokens.output.toLocaleString()} out` : '—'}</span>
        <span>Quota {usage?.tokensUsed !== undefined ? `${usage.tokensUsed.toLocaleString()}${usage.tokenLimit ? ` / ${usage.tokenLimit.toLocaleString()}` : ''}` : 'Unavailable'}</span>
        <span>Reset {usage?.resetAt ? formatCountdown(usage.resetAt) : '—'}</span>
      </div>
      {compactThreshold && contextUsed !== null && contextUsed >= compactThreshold && <span className="agent-usage-warning">Auto-compaction threshold reached</span>}
      {running && <button className="btn small" onClick={onStop}>Stop</button>}
    </section>
  )
}

function formatCountdown(resetAt: number): string {
  const seconds = Math.max(0, Math.round((resetAt - Date.now()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
