import { useCallback, useEffect, useState } from 'react'
import type { PairingStatus } from '../../../../../shared/v2/contracts/remote'

interface Props {
  initialStatus?: PairingStatus
  now?: () => number
}

function remaining(expiresAt: string | undefined, now: number): string {
  if (!expiresAt) return ''
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function RemoteControlPanel({ initialStatus, now = Date.now }: Props) {
  const [status, setStatus] = useState<PairingStatus | null>(initialStatus ?? null)
  const [relayUrl, setRelayUrl] = useState(initialStatus?.relayUrl ?? '')
  const [clock, setClock] = useState(now)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const next = await window.bs.v2['remote.status']({})
    setStatus(next)
    setRelayUrl(next.relayUrl ?? '')
  }, [])

  useEffect(() => { if (!initialStatus) void refresh().catch(error => setError(String(error))) },
    [initialStatus, refresh])
  useEffect(() => {
    if (!status || (status.state !== 'CONNECTING' && status.state !== 'PAIRING')) return
    const timer = window.setInterval(() => { setClock(now()); void refresh().catch(() => {}) }, 2_000)
    return () => window.clearInterval(timer)
  }, [now, refresh, status])

  const run = async (name: string, operation: () => Promise<PairingStatus>) => {
    if (busy) return
    setBusy(name); setError('')
    try { const next = await operation(); setStatus(next); setRelayUrl(next.relayUrl ?? relayUrl) }
    catch (error) { setError(String(error)) } finally { setBusy('') }
  }

  if (!status) return <section className="v2-control-panel"><p className="v2-panel-state">Loading remote status…</p></section>
  return <section className="v2-control-panel" aria-labelledby="v2-remote-title">
    <p className="v2-kicker">Global settings</p><h2 id="v2-remote-title">Remote Control</h2>
    <p>Pair a trusted device to monitor and steer Work Sessions remotely.</p>
    <div className="v2-setting-card"><div><h3>Remote control</h3><p>{status.enabled ? 'Accepting authenticated devices.' : 'Remote access is turned off.'}</p></div>
      <span className="v2-status-pill">{status.state}</span><button type="button" className="v2-switch" role="switch"
        aria-checked={status.enabled} aria-label="Enable remote control" disabled={Boolean(busy)}
        onClick={() => void run('enabled', () => window.bs.v2['remote.setEnabled']({ enabled: !status.enabled }))}>
        <span /></button></div>
    <form className="v2-setting-card v2-relay-form" onSubmit={event => { event.preventDefault(); void run('relay',
      () => window.bs.v2['remote.setRelayUrl']({ relayUrl: relayUrl.trim() })) }}>
      <label htmlFor="v2-relay-url"><strong>Relay server</strong><span>Use wss://, or loopback ws:// for local testing.</span></label>
      <input id="v2-relay-url" type="url" required value={relayUrl} placeholder="wss://relay.example.com"
        onChange={event => setRelayUrl(event.target.value)} disabled={Boolean(busy)} />
      <button type="submit" className="v2-btn" disabled={Boolean(busy) || !relayUrl.trim()}>Save relay</button>
    </form>
    {status.enabled ? <div className="v2-setting-card v2-pairing-card"><div><h3>Pairing</h3>
      {status.code ? <><div className="v2-pairing-code" aria-label={`Pairing code ${status.code}`}>{status.code}</div>
        <p>Expires in {remaining(status.expiresAt, clock)}</p></> : <p>Generate a short-lived code for a trusted device.</p>}</div>
      <button type="button" className="v2-btn v2-btn-primary" disabled={Boolean(busy) || status.state === 'OFFLINE'}
        onClick={() => void run('pair', () => window.bs.v2['remote.startPairing']({}))}>Generate pairing code</button></div> : null}
    <div className="v2-setting-card v2-device-list"><div><h3>Connected devices</h3>
      {status.devices.length ? status.devices.map(device => <div className="v2-device-row" key={device.id}><span><strong>{device.name}</strong><small>{device.status}</small></span>
        <button type="button" className="v2-btn v2-btn-danger" disabled={Boolean(busy)} onClick={() => {
          if (window.confirm(`Disconnect ${device.name}?`)) void run(device.id,
            () => window.bs.v2['remote.revokeDevice']({ deviceId: device.id }))
        }}>Disconnect {device.name}</button></div>) : <p>No devices connected.</p>}</div></div>
    <p className="v2-privacy-note">The relay receives no credentials. Remote commands use the same V2 validation and permission path as local actions.</p>
    {status.message ? <p className="v2-control-error" role="alert">{status.message}</p> : null}
    {error ? <p className="v2-control-error" role="alert">{error}</p> : null}
  </section>
}
