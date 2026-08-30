import { useState } from 'react'
import { KeyRound, RefreshCw } from 'lucide-react'
import type { AgentSettingsProjection } from '../../../../../shared/v2/contracts/ui-projections'

interface Props { projection: AgentSettingsProjection | null; onRefresh(): Promise<void> }

export default function ProvidersPanel({ projection, onRefresh }: Props) {
  const [providerId, setProviderId] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const run = async (key: string, operation: () => Promise<unknown>) => {
    setBusy(key); setError('')
    try { await operation(); await onRefresh() } catch { setError('Provider command failed. Check the account state and retry.') }
    finally { setBusy('') }
  }
  if (!projection) return <div className="v2-panel-state" role="status">Loading Providers…</div>
  const scopeId = projection.projectId || 'global'
  const groups = new Map<string, AgentSettingsProjection['providerAccounts'][number][]>()
  for (const account of projection.providerAccounts) {
    const group = groups.get(account.providerId) ?? []
    group.push(account)
    groups.set(account.providerId, group)
  }
  return <div className="v2-providers-panel"><header><p className="v2-kicker">Providers</p><h2>Accounts and runtime health</h2><p>Multiple accounts may remain enabled simultaneously.</p></header>
    {error ? <div className="v2-command-error" role="alert">{error}</div> : null}
    <form className="v2-provider-connect" onSubmit={event => { event.preventDefault(); const secret = apiKey; setApiKey('');
      void run('connect', () => window.bs.v2['provider.connect']({ scopeId, providerId: providerId.trim(), apiKey: secret })) }}>
      <KeyRound size={15} aria-hidden="true" /><label>Provider ID<input name="providerId" autoComplete="off" spellCheck={false} value={providerId} onChange={event => setProviderId(event.target.value)} required /></label>
      <label>API key<input name="apiKey" type="password" value={apiKey} autoComplete="off" spellCheck={false} onChange={event => setApiKey(event.target.value)} required /></label>
      <button className="v2-btn v2-btn-primary" disabled={busy !== '' || !providerId.trim() || !apiKey}>Connect account</button>
    </form>
    {groups.size === 0 ? <div className="v2-panel-state">No provider accounts are connected.</div>
      : [...groups].map(([id, accounts]) => <section className="v2-provider-card" key={id}><div className="v2-provider-card-header"><div><strong>{id}</strong><span>{accounts.length} accounts</span></div>
        <button type="button" className="v2-btn" disabled={busy !== ''} onClick={() => void run(`refresh-${id}`, () => window.bs.v2['provider.refresh']({ scopeId, providerId: id }))}><RefreshCw size={13} />Refresh</button></div>
        {accounts.map(account => <div className="v2-provider-account" key={account.id}><span><strong>{account.id}</strong><small>{account.status}</small></span><span className="v2-status-pill">{account.enabled ? 'Enabled' : 'Disabled'}</span>
          <button type="button" className="v2-btn" disabled={busy !== ''} onClick={() => void run(account.id, () => window.bs.v2['provider.setEnabled']({ scopeId,
            accountId: account.id, enabled: !account.enabled }))}>{account.enabled ? 'Disable' : 'Enable'}</button>
          <button type="button" className="v2-btn" disabled={busy !== ''} onClick={() => void run(`probe-${account.id}`, () => window.bs.v2['provider.probe']({ scopeId, providerId: id }))}>Probe</button></div>)}</section>)}
  </div>
}
