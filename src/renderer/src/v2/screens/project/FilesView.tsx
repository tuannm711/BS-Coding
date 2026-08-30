import { useEffect, useState } from 'react'
import type { ProjectWorkspaceProjection } from '../../../../../shared/v2/contracts/ui-projections'

export default function FilesView({ projectId }: { projectId: string }) {
  const [value, setValue] = useState<ProjectWorkspaceProjection | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => { let current = true; window.bs.v2['workspace.get']({ projectId }).then(result => {
    if (current) setValue(result)
  }, () => { if (current) setError(true) }); return () => { current = false } }, [projectId])
  if (error) return <div className="v2-panel-state" role="alert">Workspace is unavailable.</div>
  if (!value) return <div className="v2-panel-state" role="status">Loading workspace…</div>
  if (value.workspace.status !== 'AVAILABLE') return <div className="v2-panel-state">No workspace projection is available.</div>
  return <div className="v2-detail-panel"><p className="v2-kicker">Workspace</p><h2>{value.workspace.value.path}</h2>
    <dl><div><dt>Mode</dt><dd>{value.workspace.value.mode}</dd></div><div><dt>Files</dt><dd>{value.workspace.value.fileCount}</dd></div></dl></div>
}
