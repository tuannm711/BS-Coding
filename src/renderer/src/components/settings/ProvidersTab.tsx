import { useEffect, useState } from 'react'
import { shouldAcceptSnapshot, type ProviderAccountSnapshot, type ProviderSnapshot } from '@shared/provider-state'
import QuotaAccountCard from '../quota/QuotaAccountCard'
import AddProviderModal from './AddProviderModal'
import { providerQuotaGroups, quotaAccountState } from '../quota/quota-view'

export function groupProviderAccounts(snapshot: ProviderSnapshot | null) {
  return (snapshot?.providers ?? []).map(provider => ({ provider, accounts: snapshot?.accounts.filter(account => account.providerId === provider.id) ?? [] })).filter(group => group.accounts.length > 0)
}

export default function ProvidersTab() {
  const [modalAccount, setModalAccount] = useState<ProviderAccountSnapshot | null | undefined>(undefined)
  const [status, setStatus] = useState('')
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null)
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(() => new Set())

  const applySnapshot = (next: ProviderSnapshot) => setSnapshot(previous => !previous || shouldAcceptSnapshot(previous.revision, next.revision) ? next : previous)
  const refreshAccounts = async () => applySnapshot(await window.api.getProviderSnapshot())
  useEffect(() => {
    void window.api.getProviderSnapshot().then(applySnapshot)
    return window.api.onProviderSnapshotChanged(applySnapshot)
  }, [])

  const toggleAccount = async (accountId: string, enabled: boolean) => {
    await window.api.setProviderAccountEnabled(accountId, enabled)
    await refreshAccounts()
  }

  return <div className="settings-tab providers-tab">
    <div className="provider-actions"><button className="btn primary" onClick={() => setModalAccount(null)}>＋ Add provider ▾</button></div>
    <p className="settings-hint">Connected accounts are available to Agents and chat. Credentials stay encrypted in the OS keychain.</p>
    <div className="provider-connected">
      <h4>Connected accounts</h4>
      {groupProviderAccounts(snapshot).map(({ provider, accounts: providerAccounts }) => {
        return <section className="provider-group" key={provider.id} aria-label={`${provider.displayName} accounts`}>
          <div className="provider-group-head"><div><h5>{provider.displayName}</h5><span>{provider.description}</span></div><span className="quota-plan-badge">{providerAccounts.length} account{providerAccounts.length === 1 ? '' : 's'}</span></div>
          {providerAccounts.map(account => {
            const active = account.status === 'active'
            const refreshing = Object.values(account.refreshStages ?? {}).some(stage => stage === 'refreshing')
            return <div className={`provider-account-block ${active ? '' : 'provider-account-disabled'}`} key={account.id}>
              <QuotaAccountCard account={account} groups={providerQuotaGroups(account.usage)} tracked={account.usage?.tracked} providerLabel={provider.displayName} variant="provider" providerState={quotaAccountState(account)} expandedModels={expandedAccounts.has(account.id)} refreshing={refreshing} onToggleModels={() => setExpandedAccounts(current => {
                const next = new Set(current)
                if (next.has(account.id)) next.delete(account.id)
                else next.add(account.id)
                return next
              })} onAccountToggle={() => void toggleAccount(account.id, !active)} onReconnect={() => setModalAccount(account)} onRemove={() => void window.api.removeProviderAccount(account.id).then(refreshAccounts)} onRefresh={() => {
                setStatus(`Refreshing ${account.label}: credentials, models and usage…`)
                void window.api.refreshProviderAccount(provider.id, account.id).then(next => { applySnapshot(next); setStatus(`${account.label} refreshed.`) }).catch(error => setStatus(`Refresh failed: ${String(error)}`))
              }} />
            </div>
          })}
        </section>
      })}
      {(snapshot?.accounts.length ?? 0) === 0 && <p className="settings-hint">No providers connected yet.</p>}
    </div>
    {status && <div className="settings-status" aria-live="polite">{status}</div>}
    {modalAccount !== undefined && <AddProviderModal providers={snapshot?.providers} reconnectAccount={modalAccount ?? undefined} onClose={() => setModalAccount(undefined)} onConnected={message => { setStatus(message); void refreshAccounts() }} />}
  </div>
}
