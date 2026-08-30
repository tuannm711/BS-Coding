import type { ExecutionNodeSummary, ProjectionSection } from '../../../../../shared/v2/contracts/ui-projections'

export default function ExecutionView({ section }: { section: ProjectionSection<readonly ExecutionNodeSummary[]> }) {
  if (section.status === 'UNAVAILABLE') return <div className="v2-panel-state" role="alert">Execution unavailable: {section.errorCode}</div>
  if (section.status === 'EMPTY') return <div className="v2-panel-state">No AgentRuns are active.</div>
  return <div className="v2-execution-list">{section.value.map((item, index) => <article key={item.id} className="v2-execution-node">
    <span>{index + 1}</span><div><strong>{item.agentId ?? 'Unassigned agent'}</strong><small>Task {item.taskId}</small></div>
    <span className="v2-status-pill">{item.status}</span>
  </article>)}</div>
}
