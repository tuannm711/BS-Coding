import type { PlanProjectionSummary, ProjectionSection } from '../../../../../shared/v2/contracts/ui-projections'

interface Props { section: ProjectionSection<PlanProjectionSummary>; commandBusy: boolean; onApprove(): Promise<unknown> }
export default function PlanView({ section, commandBusy, onApprove }: Props) {
  if (section.status === 'UNAVAILABLE') return <div className="v2-panel-state" role="alert">Plan unavailable: {section.errorCode}</div>
  if (section.status === 'EMPTY') return <div className="v2-panel-state">No plan has been projected.</div>
  return <div className="v2-detail-panel"><p className="v2-kicker">Implementation plan</p><div className="v2-plan-heading"><h2>{section.value.goal}</h2><span className="v2-status-pill">{section.value.status}</span></div>
    <h3>Acceptance criteria</h3><ul>{section.value.acceptanceCriteria.map(item => <li key={item}>{item}</li>)}</ul>
    {section.value.status === 'WAITING_APPROVAL' ? <button type="button" className="v2-btn v2-btn-primary" disabled={commandBusy}
      onClick={() => void onApprove()}>Approve &amp; Execute</button> : null}</div>
}
