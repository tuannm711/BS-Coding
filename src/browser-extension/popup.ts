import type { NativeConnectionStatus } from './native-transport'

function $(id: string): HTMLElement { return document.getElementById(id)! }
function renderStatus(status: NativeConnectionStatus & { label?: string }): void {
  const descriptions: Record<NativeConnectionStatus['status'], string> = {
    connecting: 'Connecting…', connected: 'Connected to BS Coding', host_missing: 'Browser helper is not installed', app_offline: 'BS Coding is offline', error: 'Connection failed'
  }
  $('dot').className = `dot ${status.connected ? 'green' : status.status === 'connecting' ? 'amber' : 'red'}`
  $('statusText').textContent = descriptions[status.status] ?? 'Disconnected'
  $('hint').textContent = status.status === 'host_missing' ? 'Open BS Coding → Browser → Install or repair helper, then connect again.'
    : status.status === 'app_offline' ? 'Open BS Coding, then select Connect.'
      : status.status === 'error' ? status.error ?? 'Update BS Coding and reload its browser extension, then connect again.'
        : status.connected ? 'Select this connection in BS Coding Browser settings and assign a tab to your chat.' : 'Use a label to identify this Chrome profile in BS Coding.'
  if (status.label && document.activeElement !== $('label')) ($('label') as HTMLInputElement).value = status.label
}
function refreshStatus(): void {
  void chrome.runtime.sendMessage({ kind: 'status' }).then(renderStatus).catch(() => renderStatus({ connected: false, status: 'error', error: 'The extension worker is unavailable. Reload this extension in Chrome and try again.' }))
}
$('connectBtn').addEventListener('click', () => {
  const button = $('connectBtn') as HTMLButtonElement
  button.disabled = true
  void chrome.runtime.sendMessage({ kind: 'connect', label: ($('label') as HTMLInputElement).value }).then(response => {
    if (response?.ok === false) renderStatus({ connected: false, status: 'error', error: response.error })
    else renderStatus(response)
  }).catch(error => renderStatus({ connected: false, status: 'error', error: String(error) })).finally(() => { button.disabled = false })
})
chrome.runtime.onMessage.addListener(message => { if (message?.kind === 'status-update') renderStatus(message) })
refreshStatus()
