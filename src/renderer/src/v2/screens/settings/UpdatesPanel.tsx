import { useCallback, useEffect, useState } from 'react'
import type { UpdateSnapshot } from '../../../../../shared/v2/contracts/update'

interface Props {
  initialStatus?: UpdateSnapshot
}

export default function UpdatesPanel({ initialStatus }: Props) {
  const [status, setStatus] = useState<UpdateSnapshot | null>(initialStatus ?? null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [watchDownload, setWatchDownload] = useState(false)

  const refresh = useCallback(async () => {
    const next = await window.bs.v2['update.status']({})
    setStatus(next)
    return next
  }, [])

  useEffect(() => { if (!initialStatus) void refresh().catch(error => setError(String(error))) },
    [initialStatus, refresh])
  useEffect(() => {
    if (!watchDownload) return
    const timer = window.setInterval(() => { void refresh().then(next => {
      if (next.state === 'READY' || next.state === 'ERROR') setWatchDownload(false)
    }).catch(error => { setError(String(error)); setWatchDownload(false) }) }, 500)
    return () => window.clearInterval(timer)
  }, [refresh, watchDownload])

  const run = async (name: string, operation: () => Promise<UpdateSnapshot>) => {
    if (busy) return
    setBusy(name)
    setError('')
    try { setStatus(await operation()) } catch (error) {
      setError(String(error))
      await refresh().catch(() => {})
    } finally { setBusy('') }
  }

  if (!status) return <section className="v2-control-panel"><p className="v2-panel-state">Loading update status…</p></section>
  const action = status.state === 'AVAILABLE' ? 'download'
    : status.state === 'READY' ? 'apply' : 'check'

  return <section className="v2-control-panel" aria-labelledby="v2-updates-title">
    <p className="v2-kicker">Global settings</p><h2 id="v2-updates-title">Updates</h2>
    <p>Manage the update channel and how new versions are delivered.</p>
    <div className="v2-setting-card"><div><h3>Version</h3><p>{status.currentVersion ? `BS Coding v${status.currentVersion}` : 'BS Coding'}</p></div>
      <span className="v2-status-pill">{status.state === 'IDLE' ? 'Up to date' : status.state}</span></div>
    <fieldset className="v2-setting-card v2-channel-field"><legend>Update channel</legend>
      <div role="radiogroup" aria-label="Update channel">
        {(['STABLE', 'BETA'] as const).map(channel => <label key={channel}><input type="radio" name="update-channel"
          checked={status.channel === channel} disabled={Boolean(busy)} onChange={() => {
            setStatus(current => current ? { ...current, channel } : current)
            void run('channel', () => window.bs.v2['update.setChannel']({ channel }))
          }} />{channel === 'STABLE' ? 'Stable' : 'Beta'}</label>)}
      </div><p>{status.channel === 'BETA' ? 'Preview builds with the latest features.' : 'Fully tested stable releases.'}</p>
    </fieldset>
    {status.version ? <div className="v2-setting-card"><div><h3>v{status.version} is available</h3>
      <p>{status.releaseNotes || 'Release notes are unavailable.'}</p></div></div> : null}
    {status.state === 'DOWNLOADING' ? <div className="v2-update-progress" aria-label={`Download ${status.progress ?? 0}%`}>
      <div style={{ width: `${status.progress ?? 0}%` }} /><span>{status.progress ?? 0}%</span></div> : null}
    <div className="v2-control-actions"><button type="button" className="v2-btn v2-btn-primary" disabled={Boolean(busy)}
      onClick={() => { if (action === 'download') setWatchDownload(true); void run(action, action === 'download' ? () => window.bs.v2['update.download']({})
        : action === 'apply' ? () => window.bs.v2['update.apply']({}) : () => window.bs.v2['update.check']({})); }}>
      {busy ? 'Working…' : action === 'download' ? 'Download update' : action === 'apply' ? 'Restart and install' : 'Check for updates'}
    </button></div>
    {status.message ? <p className={status.state === 'ERROR' ? 'v2-control-error' : 'v2-control-message'}
      role={status.state === 'ERROR' ? 'alert' : 'status'}>{status.message}</p> : null}
    {error ? <p className="v2-control-error" role="alert">{error}</p> : null}
  </section>
}
