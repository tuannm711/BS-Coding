import { useEffect, useMemo, useState } from 'react'
import type { ProviderCapability, ProviderConnectRequest } from '@shared/providers'
import Modal from './Modal'

interface Props { onClose(): void; onConnected(message: string): void }

export default function AddProviderModal({ onClose, onConnected }: Props) {
  const [capabilities, setCapabilities] = useState<ProviderCapability[]>([])
  const [providerId, setProviderId] = useState('')
  const [methodId, setMethodId] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void window.api.listProviderCapabilities().then(next => { setCapabilities(next); if (next[0]) { setProviderId(next[0].id); setMethodId(next[0].methods[0]?.id ?? '') } }) }, [])
  const provider = capabilities.find(item => item.id === providerId)
  const method = provider?.methods.find(item => item.id === methodId)
  const requiredFields = method?.fields ?? []
  const canSubmit = Boolean(provider && method && requiredFields.every(field => field === 'baseUrl' || fields[field]?.trim()))
  const title = useMemo(() => provider ? `Add ${provider.displayName}` : 'Add provider', [provider])

  const submit = async () => {
    if (!provider || !method || !canSubmit) return
    setBusy(true); setError('')
    try {
      const request: ProviderConnectRequest = { providerId, methodId, fields }
      const result = await window.api.connectProviderMethod(request)
      onConnected(result.authUrl ? 'Browser sign-in started. Complete the login to add the account.' : `Connected ${provider.displayName}.`)
      onClose()
    } catch (err) { setError(String(err)) } finally { setBusy(false) }
  }

  return <Modal title={title} onClose={onClose} onSubmit={() => void submit()} submitLabel={busy ? 'Connecting…' : 'Continue'} submitDisabled={!canSubmit || busy}>
    <label className="settings-field-label" htmlFor="provider-select">Provider</label>
    <select id="provider-select" className="input" value={providerId} onChange={e => { const next = capabilities.find(item => item.id === e.target.value); setProviderId(e.target.value); setMethodId(next?.methods[0]?.id ?? ''); setFields({}) }}>
      {capabilities.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
    </select>
    {provider && <p className="settings-hint">{provider.description}</p>}
    <label className="settings-field-label" htmlFor="provider-method">Connection method</label>
    <select id="provider-method" className="input" value={methodId} onChange={e => { setMethodId(e.target.value); setFields({}) }}>
      {provider?.methods.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {method?.opensBrowser && <p className="settings-hint">A browser window will open for OAuth. You can keep multiple accounts connected.</p>}
    {method && !method.opensBrowser && requiredFields.map(field => <input key={field} className="input" type={field.toLowerCase().includes('key') ? 'password' : 'text'} placeholder={field === 'credentialJson' ? 'Paste credential JSON' : field} value={fields[field] ?? ''} onChange={e => setFields(previous => ({ ...previous, [field]: e.target.value }))} />)}
    {method && !method.opensBrowser && <input className="input" placeholder="account label (optional)" value={fields.label ?? ''} onChange={e => setFields(previous => ({ ...previous, label: e.target.value }))} />}
    {error && <div className="settings-status error" role="alert">{error}</div>}
  </Modal>
}
