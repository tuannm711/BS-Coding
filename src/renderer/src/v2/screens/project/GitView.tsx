import { useEffect, useState } from 'react'
import type { GitSummary } from '../../../../../shared/v2/contracts/ui-projections'

export default function GitView({ projectId }: { projectId: string }) {
  const [value, setValue] = useState<GitSummary | null>(null); const [error, setError] = useState(false)
  useEffect(() => { let current = true; window.bs.v2['git.status']({ projectId }).then(result => {
    if (current) setValue(result)
  }, () => { if (current) setError(true) }); return () => { current = false } }, [projectId])
  if (error) return <div className="v2-panel-state" role="alert">Git status is unavailable.</div>
  if (!value) return <div className="v2-panel-state" role="status">Loading Git status…</div>
  return <div className="v2-detail-panel"><p className="v2-kicker">Repository</p><h2>{value.branch}</h2><p>{value.dirty ? `${value.changedFiles.length} changed files` : 'Working tree clean'}</p>
    {value.changedFiles.length ? <ul className="v2-file-list">{value.changedFiles.map(file => <li key={file}>{file}</li>)}</ul> : null}</div>
}
