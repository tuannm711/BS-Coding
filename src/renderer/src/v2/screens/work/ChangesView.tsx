import type { ChangeFileSummary, ProjectionSection } from '../../../../../shared/v2/contracts/ui-projections'

export default function ChangesView({ section }: { section: ProjectionSection<readonly ChangeFileSummary[]> }) {
  if (section.status === 'UNAVAILABLE') return <div className="v2-panel-state" role="alert">Changes unavailable: {section.errorCode}</div>
  if (section.status === 'EMPTY') return <div className="v2-panel-state">No change artifacts have been recorded.</div>
  const additions = section.value.reduce((sum, item) => sum + item.additions, 0); const deletions = section.value.reduce((sum, item) => sum + item.deletions, 0)
  return <div className="v2-detail-panel"><p className="v2-kicker">Change set</p><h2>{section.value.length} files changed · <span className="v2-text-ok">+{additions}</span> <span className="v2-text-error">−{deletions}</span></h2>
    <ul className="v2-change-list">{section.value.map(item => <li key={item.path}><code>{item.path}</code><span>+{item.additions} −{item.deletions}</span></li>)}</ul></div>
}
