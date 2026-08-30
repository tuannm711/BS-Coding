import type { ProjectionSection, TaskProjectionSummary } from '../../../../../shared/v2/contracts/ui-projections'

export default function TasksView({ section }: { section: ProjectionSection<readonly TaskProjectionSummary[]> }) {
  if (section.status === 'UNAVAILABLE') return <div className="v2-panel-state" role="alert">Tasks unavailable: {section.errorCode}</div>
  if (section.status === 'EMPTY') return <div className="v2-panel-state">No tasks have been created.</div>
  const completed = section.value.filter(item => item.status === 'COMPLETED').length
  return <div><div className="v2-task-progress"><strong>{completed} / {section.value.length} tasks complete</strong><span>{Math.round(completed / section.value.length * 100)}%</span></div>
    <div className="v2-task-list">{section.value.map((item, index) => <article className="v2-task-row" key={item.id}>
      <span className={`v2-task-marker v2-task-${item.status.toLowerCase()}`}>{item.status === 'COMPLETED' ? '✓' : index + 1}</span>
      <div><strong>{item.title}</strong><small>{item.dependsOn.length ? `Depends on ${item.dependsOn.join(', ')}` : 'No dependencies'}</small></div>
      {item.assignedAgentId ? <span>{item.assignedAgentId}</span> : null}<span className="v2-status-pill">{item.status}</span>
    </article>)}</div></div>
}
