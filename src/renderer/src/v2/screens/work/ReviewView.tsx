import type { ProjectionSection, ReviewProjectionSummary } from '../../../../../shared/v2/contracts/ui-projections'

interface Props { section: ProjectionSection<ReviewProjectionSummary>; commandBusy: boolean; onCreateRework(findingId: string, title: string): Promise<unknown> }
export default function ReviewView({ section, commandBusy, onCreateRework }: Props) {
  if (section.status === 'UNAVAILABLE') return <div className="v2-panel-state" role="alert">Review unavailable: {section.errorCode}</div>
  if (section.status === 'EMPTY') return <div className="v2-panel-state">No reviews or findings have been recorded.</div>
  return <div className="v2-review-grid"><section><p className="v2-kicker">Mechanical checks</p>{section.value.gates.length ? section.value.gates.map(gate => <div className="v2-review-row" key={gate.id}><span>{gate.id}</span><span className="v2-status-pill">{gate.status}</span></div>) : <div className="v2-panel-state">No gate results.</div>}</section>
    <section><p className="v2-kicker">AI reviews</p>{section.value.reviews.map(review => <div className="v2-review-row" key={review.id}><span>{review.reviewerAgentVersionId}</span><span className="v2-status-pill">{review.decision}</span></div>)}</section>
    <section className="v2-review-findings"><p className="v2-kicker">Findings</p>{section.value.findings.map(finding => <article key={finding.id} className="v2-finding"><header><span>{finding.severity}</span><span>{finding.status}</span></header><p>{finding.description}</p>
      {finding.linkedReworkTaskId ? <small>Rework task: {finding.linkedReworkTaskId}</small> : finding.status === 'OPEN' ? <button type="button" className="v2-btn" disabled={commandBusy}
        onClick={() => void onCreateRework(finding.id, `Resolve ${finding.description}`)}>Create rework task</button> : null}</article>)}</section></div>
}
