import { useEffect, useState } from 'react'
import type { BsSettings, CatalogProviderSummary, ProviderUsage } from '@shared/types'
import type { ProviderSnapshot } from '@shared/provider-state'
import { OPENAI_OAUTH_MODELS, isOpenAiGenericModel } from '@shared/openai-oauth'
import QuotaAccountCard from '../quota/QuotaAccountCard'
import AddProviderModal from './AddProviderModal'

interface Props { settings: BsSettings; catalog: CatalogProviderSummary[]; onChange: (patch: Partial<BsSettings>) => void }

export function groupProviderAccounts(snapshot: ProviderSnapshot | null) {
  return (snapshot?.providers ?? []).map(provider => ({ provider, accounts: snapshot?.accounts.filter(account => account.providerId === provider.id) ?? [] })).filter(group => group.accounts.length > 0)
}

export default function ProvidersTab({ settings, onChange }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [usageByAccount, setUsageByAccount] = useState<Record<string, ProviderUsage>>({})
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null)

  const refreshAccounts = async () => setSnapshot(await window.api.getProviderSnapshot())
  useEffect(() => {
    void window.api.getProviderSnapshot().then(setSnapshot)
    return window.api.onProviderSnapshotChanged(next => setSnapshot(previous => !previous || next.revision >= previous.revision ? next : previous))
  }, [])
  useEffect(() => {
    void window.api.refreshProviderUsage().then(next => setUsageByAccount(Object.fromEntries(next.map(item => [item.accountId, item]))))
    return window.api.onProviderUsage(next => setUsageByAccount(previous => ({ ...previous, [next.accountId]: next })))
  }, [])
  useEffect(() => {
    const oauth = snapshot?.accounts.some(a => a.providerId === 'openai' && a.authMode === 'oauth' && a.status === 'active')
    if (!oauth) return
    const current = settings.providers.find(p => p.id === 'openai')
    const models = [...new Set([...(current?.models ?? []).filter(model => !isOpenAiGenericModel(model)), ...OPENAI_OAUTH_MODELS])]
    const unchanged = current?.models.length === models.length && current.models.every((model, index) => model === models[index])
    if (!current || !unchanged) onChange({ providers: current ? settings.providers.map(p => p.id === 'openai' ? { ...p, models } : p) : [...settings.providers, { id: 'openai', apiKey: '', models }] })
  }, [snapshot, onChange, settings.providers])

  const toggleAccount = async (accountId: string, enabled: boolean) => {
    await window.api.setProviderAccountEnabled(accountId, enabled)
    await refreshAccounts()
  }

  return <div className="settings-tab providers-tab">
    <div className="provider-actions"><button className="btn primary" onClick={() => setModalOpen(true)}>＋ Add provider ▾</button></div>
    <p className="settings-hint">Connected accounts are available to Agents and chat. Credentials stay encrypted in the OS keychain.</p>
    <div className="provider-connected">
      <h4>Connected accounts</h4>
      {groupProviderAccounts(snapshot).map(({ provider, accounts: providerAccounts }) => {
        return <section className="provider-group" key={provider.id} aria-label={`${provider.displayName} accounts`}>
          <div className="provider-group-head"><div><h5>{provider.displayName}</h5><span>{provider.description}</span></div><span className="quota-plan-badge">{providerAccounts.length} account{providerAccounts.length === 1 ? '' : 's'}</span></div>
          {providerAccounts.map(account => {
            const usage = usageByAccount[account.id] ?? account.usage ?? { accountId: account.id, accountLabel: account.profile?.email ?? account.label, accountType: account.authMode === 'oauth' ? 'oauth' : 'api-key', refreshedAt: 0, source: 'unavailable' as const, status: 'unavailable' as const, unavailableReason: 'Quota not refreshed yet' }
            const active = account.status === 'active'
            return <div className={`provider-account-block ${active ? '' : 'provider-account-disabled'}`} key={account.id}>
              <div className="provider-account-models" aria-label={`Models for ${account.label}`}>{account.models.map(model => <code key={model.id}>{model.name}</code>)}</div>
              <QuotaAccountCard usage={usage} providerLabel={provider.displayName} accountStatus={active ? 'active' : 'inactive'} onAccountToggle={enabled => void toggleAccount(account.id, enabled)} onRefresh={() => {
                setStatus(`Refreshing ${account.label}: credentials, models and usage…`)
                void window.api.refreshProviderAccount(provider.id, account.id).then(next => { setSnapshot(next); setStatus(`${account.label} refreshed.`) }).catch(error => setStatus(`Refresh failed: ${String(error)}`))
              }} />
              <div className="provider-account-actions"><span className={`mcp-dot ${active ? 'connected' : ''}`} /><span className="settings-hint">{account.authMode}</span><button className="btn small" onClick={() => setModalOpen(true)}>Reconnect</button><button className="btn small danger" onClick={() => void window.api.removeProviderAccount(account.id).then(refreshAccounts)}>Remove</button></div>
            </div>
          })}
        </section>
      })}
      {(snapshot?.accounts.length ?? 0) === 0 && <p className="settings-hint">No providers connected yet.</p>}
    </div>
    {status && <div className="settings-status">{status}</div>}
    {modalOpen && <AddProviderModal onClose={() => setModalOpen(false)} onConnected={message => { setStatus(message); void refreshAccounts() }} />}
  </div>
}
