import { X } from 'lucide-react'
import type { ProjectionSection, RuntimeEpochSummary } from '../../../../../shared/v2/contracts/ui-projections'

export default function RuntimeHistory({ section, onClose }: { section: ProjectionSection<readonly RuntimeEpochSummary[]>; onClose(): void }) {
  return <div className="v2-drawer-backdrop" role="presentation" onClick={onClose}><aside className="v2-runtime-drawer" aria-label="Runtime History" onClick={event => event.stopPropagation()}>
    <header><h2>Runtime History</h2><button type="button" aria-label="Close runtime history" onClick={onClose}><X size={16} /></button></header>
    <div>{section.status === 'UNAVAILABLE' ? <div className="v2-panel-state">Runtime history unavailable: {section.errorCode}</div>
      : section.status === 'EMPTY' ? <div className="v2-panel-state">No RuntimeEpochs recorded.</div>
        : section.value.map((epoch, index) => <article className="v2-epoch" key={epoch.id}><span>Epoch {index + 1}</span><strong>{epoch.modelId}</strong><small>{epoch.providerId} · {epoch.accountId}</small>
          <div><time>{new Date(epoch.startedAt).toLocaleString()}</time><span className="v2-status-pill">{epoch.status}</span></div></article>)}</div>
  </aside></div>
}
