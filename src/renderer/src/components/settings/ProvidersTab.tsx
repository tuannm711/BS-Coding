import { useEffect, useState } from 'react'
import type { BsSettings, CatalogProviderSummary, ProviderConnection, ProviderUsage } from '@shared/types'
import { OPENAI_OAUTH_MODELS, isOpenAiGenericModel } from '@shared/openai-oauth'
import QuotaAccountCard from '../quota/QuotaAccountCard'
import AddProviderModal from './AddProviderModal'

interface Props { settings: BsSettings; catalog: CatalogProviderSummary[]; onChange: (patch: Partial<BsSettings>) => void }

export default function ProvidersTab({ settings, onChange }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [accounts, setAccounts] = useState<ProviderConnection[]>([])
  const [usageByAccount, setUsageByAccount] = useState<Record<string, ProviderUsage>>({})

  const refreshAccounts = async () => setAccounts(await window.api.listProviderAccounts())
  useEffect(() => { void refreshAccounts() }, [])
  useEffect(() => window.api.onProviderAccountsChanged(next => setAccounts(next)), [])
  useEffect(() => {
    void window.api.refreshProviderUsage().then(next => setUsageByAccount(Object.fromEntries(next.map(item => [item.accountId, item]))))
    return window.api.onProviderUsage(next => setUsageByAccount(previous => ({ ...previous, [next.accountId]: next })))
  }, [])
  useEffect(() => {
    const oauth = accounts.find(c => c.providerId === 'openai')?.accounts.some(a => a.authMode === 'oauth' && a.status === 'active')
    if (!oauth) return
    const current = settings.providers.find(p => p.id === 'openai')
    const models = [...new Set([...(current?.models ?? []).filter(model => !isOpenAiGenericModel(model)), ...OPENAI_OAUTH_MODELS])]
    const unchanged = current?.models.length === models.length && current.models.every((model, index) => model === models[index])
    if (!current || !unchanged) onChange({ providers: current ? settings.providers.map(p => p.id === 'openai' ? { ...p, models } : p) : [...settings.providers, { id: 'openai', apiKey: '', models }] })
  }, [accounts, onChange, settings.providers])

  const toggleAccount = async (accountId: string, enabled: boolean) => {
    await window.api.setProviderAccountEnabled(accountId, enabled)
    await refreshAccounts()
  }

  return <div className="settings-tab providers-tab">
    <div className="provider-actions"><button className="btn primary" onClick={() => setModalOpen(true)}>＋ Add provider ▾</button></div>
    <p className="settings-hint">Connected accounts are available to Agents and chat. Credentials stay encrypted in the OS keychain.</p>
    <div className="provider-connected">
      <h4>Connected accounts</h4>
      {accounts.flatMap(connection => connection.accounts.map(account => ({ connection, account }))).map(({ connection, account }) => {
        const usage = usageByAccount[account.id] ?? { accountId: account.id, accountLabel: account.profile?.email ?? account.label, accountType: account.authMode === 'oauth' ? 'oauth' : 'api-key', refreshedAt: 0, source: 'unavailable' as const, status: 'unavailable' as const, unavailableReason: 'Quota not refreshed yet' }
        const active = account.status === 'active'
        return <div className={`provider-account-block ${active ? '' : 'provider-account-disabled'}`} key={account.id}>
          <div className="provider-account-models" aria-label={`Models for ${account.label}`}>{(account.models ?? []).map(model => <code key={model}>{model}</code>)}</div>
          <QuotaAccountCard usage={usage} accountStatus={active ? 'active' : 'inactive'} onAccountToggle={enabled => void toggleAccount(account.id, enabled)} onRefresh={() => void window.api.refreshProviderUsage(connection.providerId, account.id)} />
          <div className="provider-account-actions"><span className={`mcp-dot ${active ? 'connected' : ''}`} /><span className="settings-hint">{account.authMode}</span><button className="btn small danger" onClick={() => void window.api.removeProviderAccount(account.id).then(refreshAccounts)}>Remove</button></div>
        </div>
      })}
      {accounts.length === 0 && <p className="settings-hint">No providers connected yet.</p>}
    </div>
    {status && <div className="settings-status">{status}</div>}
    {modalOpen && <AddProviderModal onClose={() => setModalOpen(false)} onConnected={message => { setStatus(message); void refreshAccounts() }} />}
  </div>
}
