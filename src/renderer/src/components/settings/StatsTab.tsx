import { useEffect, useState } from 'react'
import type { StatsSummary } from '@shared/types'
import { formatCount, formatMoney } from '../quota/quota-view'

const UNATTRIBUTED = 'Unattributed'

// Ordering and the empty check live outside the component so they can be tested
// without rendering — the suite runs with environment: 'node'.
export function formatStatsRows(summary: StatsSummary) {
  const models = Object.entries(summary.perModel)
    .map(([name, usage]) => ({ name: name || UNATTRIBUTED, ...usage }))
    .sort((a, b) => b.cost - a.cost)
  const sessions = [...summary.perSession].sort((a, b) => b.usage.cost - a.usage.cost)
  return { models, sessions, empty: models.length === 0 && sessions.length === 0 }
}

export function StatsView({ summary }: { summary: StatsSummary | null }) {
  if (!summary) return <div className="settings-tab stats-tab"><p className="settings-hint">Loading usage…</p></div>
  const { models, sessions, empty } = formatStatsRows(summary)

  return (
    <div className="settings-tab stats-tab">
      <p className="settings-hint">
        What BS Coding has recorded for its own requests. Provider dashboards may
        differ; this counts only turns run from this app.
      </p>

      <div className="stats-totals">
        <span className="quota-metric"><small>Estimated cost</small><strong>{formatMoney(summary.totalCost)}</strong></span>
        <span className="quota-metric"><small>Tokens</small><strong>{formatCount(summary.totalTokens)}</strong></span>
      </div>

      {empty ? <p className="quota-empty">No usage recorded yet.</p> : null}

      {models.length > 0 ? <section className="stats-section" aria-label="Usage by model">
        <h6>By model</h6>
        <table className="stats-table">
          <thead><tr><th>Model</th><th>Messages</th><th>Tokens</th><th>Cost</th></tr></thead>
          <tbody>
            {models.map(row => <tr key={row.name}>
              <td><code>{row.name}</code></td>
              <td>{formatCount(row.messages)}</td>
              <td>{formatCount(row.tokens)}</td>
              <td>{formatMoney(row.cost)}</td>
            </tr>)}
          </tbody>
        </table>
      </section> : null}

      {sessions.length > 0 ? <section className="stats-section" aria-label="Usage by session">
        <h6>By session</h6>
        <table className="stats-table">
          <thead><tr><th>Session</th><th>Model</th><th>Tokens</th><th>Cost</th></tr></thead>
          <tbody>
            {sessions.map(row => <tr key={row.id}>
              <td title={row.title}>{row.title}</td>
              <td><code>{row.model || UNATTRIBUTED}</code></td>
              <td>{formatCount(row.usage.input + row.usage.output + row.usage.cacheRead + row.usage.cacheWrite)}</td>
              <td>{formatMoney(row.usage.cost)}</td>
            </tr>)}
          </tbody>
        </table>
      </section> : null}
    </div>
  )
}

export default function StatsTab() {
  const [summary, setSummary] = useState<StatsSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.api.getStats().then(next => { if (!cancelled) setSummary(next) })
    return () => { cancelled = true }
  }, [])

  return <StatsView summary={summary} />
}
