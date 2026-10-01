import { useEffect, useRef, useState } from 'react'
import type { BrowserStatusInfo, BrowserTabInfo } from '@shared/browser-types'
import Modal from './settings/Modal'

interface Props { status: BrowserStatusInfo | null; projectPath?: string; sessionId?: string; onClose(): void }
export default function BrowserDialog({ status, projectPath, sessionId, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [tabs, setTabs] = useState<BrowserTabInfo[]>([])
  const [tabId, setTabId] = useState('')
  const [loadingTabs, setLoadingTabs] = useState(false)
  const request = useRef(0)
  const mounted = useRef(true)
  const connectionId = status?.selectedConnectionId
  const selected = status?.connections?.find(connection => connection.id === connectionId)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++ } }, [])
  const refreshTabs = async () => {
    if (!connectionId || !selected?.connected) return
    const revision = ++request.current
    setLoadingTabs(true)
    try {
      const next = await window.api.listBrowserTabs(connectionId)
      if (!mounted.current || revision !== request.current) return
      setTabs(next)
      setTabId(current => next.some(tab => String(tab.id) === current) ? current : '')
    } catch (e) { if (mounted.current && revision === request.current) { setTabs([]); setError(String(e)) } }
    finally { if (mounted.current && revision === request.current) setLoadingTabs(false) }
  }
  useEffect(() => { setTabs([]); setTabId(''); void refreshTabs(); return () => { request.current++ } }, [connectionId, selected?.connected])
  const setup = async () => {
    if (busy) return
    setBusy(true); setError(''); setFeedback('')
    try {
      const next = await window.api.setupNativeBrowser()
      if (!mounted.current) return
      if (next.nativeHostInstalled) setFeedback('Helper installed. Reload the extension, then click Connect in its popup.')
      else setError(next.error ?? 'Helper setup failed. Try Install / Repair again.')
    } catch (e) { if (mounted.current) setError(String(e)) }
    finally { if (mounted.current) setBusy(false) }
  }
  const assign = async () => {
    if (!projectPath || !sessionId || !connectionId || !tabId || busy) return
    setBusy(true); setError(''); setFeedback('')
    try {
      await window.api.assignBrowserTab(projectPath, sessionId, connectionId, Number(tabId))
      if (mounted.current) setFeedback('Tab assigned to this chat. The agent can now read and control it.')
    } catch (e) { if (mounted.current) setError(String(e)) }
    finally { if (mounted.current) setBusy(false) }
  }
  return <Modal title="Browser connection" onClose={onClose} showDefaultActions={false}>
    <p className="browser-hint">Use your signed-in Chrome profile through the BS Coding extension. Native Messaging reconnects when the app or extension restarts.</p>
    <p className={`browser-pill ${status?.paired ? 'browser-pill-on' : 'browser-pill-waiting'}`}>{status?.paired ? 'Connected · Native Messaging' : 'Waiting for extension · Native Messaging'}</p>
    <div className="browser-section">
      <p className="browser-section-label">Setup</p>
      <p className="browser-hint">Install the helper for your OS user, load the extension in your chosen profile, and click Connect. No port or pairing code is needed.</p>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => void setup()}>{busy ? 'Working…' : 'Install / Repair helper'}</button>
        <button className="btn" onClick={() => void window.api.openBrowserInstallGuide()}>Install guide</button>
        <button className="btn" onClick={() => void window.api.openBrowserExtensionFolder()}>Extension folder</button>
      </div>
    </div>
    <label className="settings-field-label" htmlFor="browser-profile">Connected profile</label>
    <select id="browser-profile" className="input" value={connectionId ?? ''} disabled={busy || !(status?.connections?.length)} onChange={event => {
      setError(''); setFeedback('')
      void window.api.selectBrowserConnection(event.target.value).catch(e => setError(String(e)))
    }}>
      {!status?.connections?.length && <option value="">Connect the extension in Chrome</option>}
      {connectionId && !status?.connections?.some(connection => connection.id === connectionId) && <option value={connectionId}>Previously selected profile is offline</option>}
      {status?.connections?.map(connection => <option key={connection.id} value={connection.id} disabled={!connection.connected}>{connection.label} · {connection.id.slice(0, 8)}{!connection.connected ? ' · offline' : ''}</option>)}
    </select>
    {connectionId && selected && <button className="btn" disabled={busy} onClick={() => {
      setError(''); setFeedback('')
      void window.api.setBrowserConnectionEnabled(connectionId, selected.enabled === false).then(() => setFeedback(selected.enabled === false ? 'Profile enabled. Click Connect in the extension to reconnect.' : 'Profile disabled. Its commands are stopped and automatic reconnect is blocked.')).catch(e => setError(String(e)))
    }}>{selected.enabled === false ? 'Enable profile' : 'Disable profile'}</button>}
    <label className="settings-field-label" htmlFor="browser-tab">Tab for current chat</label>
    <select id="browser-tab" className="input" value={tabId} disabled={busy || loadingTabs || !connectionId} onChange={event => setTabId(event.target.value)}>
      <option value="">{loadingTabs ? 'Loading tabs…' : 'Select an existing tab to assign'}</option>
      {tabs.map(tab => <option key={tab.id} value={String(tab.id)}>{tab.title || 'Untitled'} · {tab.url}</option>)}
    </select>
    {!sessionId && <p className="settings-hint">Open a project chat to assign an existing tab. Agents can also create their own tabs.</p>}
    <div className="row">
      <button className="btn" disabled={!selected?.connected || loadingTabs} onClick={() => void refreshTabs()}>Refresh tabs</button>
      <button className="btn primary" disabled={busy || !selected?.connected || !tabId || !sessionId || !projectPath} onClick={() => void assign()}>Assign tab to current chat</button>
    </div>
    {(error || status?.error) && <p className="settings-error" role="alert">{error || status?.error}</p>}
    {feedback && <p className="settings-status" role="status">{feedback}</p>}
    <div className="dialog-actions"><button className="btn" onClick={onClose}>Close</button></div>
  </Modal>
}
