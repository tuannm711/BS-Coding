import { useEffect, useState } from 'react'
import type { McpServerSummary } from '../../../../../shared/v2/contracts/ui-projections'

export default function McpView({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<readonly McpServerSummary[] | null>(null); const [error, setError] = useState(false)
  useEffect(() => { let current = true; window.bs.v2['mcp.listServers']({ projectId }).then(value => {
    if (current) setItems(value)
  }, () => { if (current) setError(true) }); return () => { current = false } }, [projectId])
  if (error) return <div className="v2-panel-state" role="alert">MCP servers are unavailable.</div>
  if (!items) return <div className="v2-panel-state" role="status">Loading MCP servers…</div>
  if (!items.length) return <div className="v2-panel-state">No MCP servers are configured.</div>
  return <div className="v2-tab-list">{items.map(item => <div className="v2-tab-row" key={item.id}><span><strong>{item.name}</strong><small>{item.toolNames.length} tools</small></span><span className="v2-status-pill">{item.status}</span></div>)}</div>
}
