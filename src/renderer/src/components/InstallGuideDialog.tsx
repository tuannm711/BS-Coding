import { useRef, useEffect, useState } from 'react'
import type { BrowserInstallGuideEvent } from '@shared/ipc'
import Modal from './settings/Modal'
interface Props { guide: BrowserInstallGuideEvent | null; onClose(): void }
export default function InstallGuideDialog({ guide, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  return <Modal title="Install BS Coding browser extension" onClose={onClose} showDefaultActions={false}>
    <ol className="browser-guide">
      <li>Install the native helper for your OS user using the button below.</li>
      <li>Open <strong>chrome://extensions</strong> in the Chrome profile you want to use and enable <strong>Developer mode</strong>.</li>
      <li>Click <strong>Load unpacked</strong> and select:<code className="browser-guide-dir">{guide?.extensionDir}</code></li>
      <li>If the old extension is loaded, remove it and load this updated folder once. The new extension keeps a stable identity for future updates.</li>
      <li>Open the extension popup, name this profile, then click <strong>Connect</strong>. Choose the connection and assign a tab in Browser settings.</li>
    </ol>
    <p className="browser-hint">The helper connects using OS IPC on this machine. It uses no network port and does not copy your browser credentials. After an app update, use Install / Repair and reload the extension.</p>
    <button className="btn primary" disabled={busy} onClick={() => {
      setBusy(true); setError(''); setFeedback('')
      void window.api.setupNativeBrowser().then(status => { if (!mounted.current) return; if (status.nativeHostInstalled) setFeedback('Helper installed. Continue with the extension setup.'); else setError(status.error ?? 'Helper installation failed.') }).catch(e => { if (mounted.current) setError(String(e)) }).finally(() => { if (mounted.current) setBusy(false) })
    }}>{busy ? 'Installing…' : 'Install / Repair helper'}</button>
    {feedback && <p className="settings-status" role="status">{feedback}</p>}
    {error && <p className="settings-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      <button className="btn" onClick={() => void window.api.openBrowserChromeExtensions()}>Open chrome://extensions</button>
      <button className="btn" onClick={() => void window.api.openBrowserExtensionFolder()}>Extension folder</button>
      <button className="btn" onClick={onClose}>Close</button>
    </div>
  </Modal>
}
