import { useEffect, useState } from 'react'
import type { CatalogProviderSummary, BsSettings, ProviderConnection, ProviderSettings, ProviderUsage } from '@shared/types'
import { OPENAI_OAUTH_MODELS } from '@shared/openai-oauth'
import Modal from './Modal'

interface Props {
  settings: BsSettings
  catalog: CatalogProviderSummary[]
  onChange: (patch: Partial<BsSettings>) => void
}

type ConnectModal =
  | { kind: 'catalog'; id: string; name: string }
  | { kind: 'manual' }
  | null

export default function ProvidersTab({ settings, catalog, onChange }: Props) {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ConnectModal>(null)
  const [providerId, setProviderId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [accounts, setAccounts] = useState<ProviderConnection[]>([])
  const [loginBusy, setLoginBusy] = useState(false)
  const [usageByAccount, setUsageByAccount] = useState<Record<string, ProviderUsage>>({})

  const connected = settings.providers
  const visibleProviders: ProviderSettings[] = [
    ...connected,
    ...accounts
      .filter(connection => !connected.some(provider => provider.id === connection.providerId))
      .map(connection => ({ id: connection.providerId, apiKey: '', models: [] } satisfies ProviderSettings))
  ]

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
    const models = [...new Set([...(current?.models ?? []), ...OPENAI_OAUTH_MODELS])]
    const unchanged = current?.models.length === models.length && current.models.every((model, index) => model === models[index])
    if (!current || !unchanged) {
      onChange({
        providers: current
          ? settings.providers.map(p => p.id === 'openai' ? { ...p, models } : p)
          : [...settings.providers, { id: 'openai', apiKey: '', models }]
      })
    }
  }, [accounts, onChange, settings.providers])

  const loginWithChatGpt = async () => {
    setLoginBusy(true)
    setStatus('')
    try {
      await window.api.startProviderLogin('openai')
      setStatus('ChatGPT login started in your browser. Complete it to add the account.')
      await refreshAccounts()
    } catch (err) {
      setStatus(String(err))
    } finally {
      setLoginBusy(false)
    }
  }

  const filtered = catalog.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.id.toLowerCase().includes(search.toLowerCase())
  )

  const openCatalog = (id: string, name: string) => {
    setProviderId(id)
    setApiKey('')
    setBaseUrl('')
    setModal({ kind: 'catalog', id, name })
  }

  const openManual = () => {
    setProviderId('')
    setApiKey('')
    setBaseUrl('')
    setModal({ kind: 'manual' })
  }

  const connect = async () => {
    const id = providerId.trim()
    if (!id || !apiKey.trim()) return
    setStatus('')
    const result = await window.api.connectProvider(id, apiKey.trim(), baseUrl.trim() || undefined)
    setModal(null)
    onChange({ providers: result.providers, defaultProvider: result.defaultProvider })
    const provider = result.providers.find(p => p.id === id)
    setStatus(provider && provider.models.length > 0
      ? `Connected ${id}. ${provider.models.length} model(s) synced.`
      : `Connected ${id}. Models will sync when models.dev is reachable.`)
  }

  const disconnect = async (id: string) => {
    const result = await window.api.disconnectProvider(id)
    if (expandedId === id) {
      setExpandedId(null)
      setModels([])
    }
    onChange({ providers: result.providers, defaultProvider: result.defaultProvider })
    setStatus(`Disconnected ${id}.`)
  }

  const maskKey = (key: string): string =>
    key.length <= 8 ? '••••' : `${key.slice(0, 4)}…${key.slice(-4)}`

  const viewModels = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setModels([])
      return
    }
    setExpandedId(id)
    setModels(await window.api.fetchProviderModels(id))
  }

  const setDefault = async (id: string) => {
    // Persist immediately (like connect/disconnect) instead of patching the
    // draft: onRefresh would re-fetch the unsaved value and clobber the change.
    await window.api.saveSettings({ ...settings, defaultProvider: id })
    onChange({ defaultProvider: id })
  }

  return (
    <div className="settings-tab providers-tab">
      <div className="provider-actions">
        <button className="btn" onClick={openManual}>+ Connect provider</button>
        <button className="btn" onClick={() => void loginWithChatGpt()} disabled={loginBusy}>
          {loginBusy ? 'Opening ChatGPT…' : 'Sign in with ChatGPT'}
        </button>
      </div>
      <p className="settings-hint">
        Find a provider below and enter your API key, or use "+ Connect provider". Models are synced
        automatically from models.dev. API keys are stored encrypted in the OS keychain.
      </p>

      <div className="provider-connect">
        <input
          className="input provider-search"
          placeholder="Search providers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="provider-catalog">
          {filtered.map(c => {
            const isConnected = connected.some(p => p.id === c.id)
            return (
              <div className="provider-catalog-row" key={c.id}>
                <span className="provider-catalog-name">
                  {c.name} <code>{c.id}</code>
                </span>
                <span className="provider-catalog-meta">{c.modelCount} models</span>
                {isConnected ? (
                  <span className="provider-catalog-connected">Connected</span>
                ) : (
                  <button className="btn small" onClick={() => openCatalog(c.id, c.name)}>
                    Connect
                  </button>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && <p className="settings-hint">No providers match.</p>}
        </div>
      </div>

      <div className="provider-connected">
        <h4>Connected</h4>
        {visibleProviders.map(p => (
          <div className="provider-card" key={p.id}>
            <div className="provider-connected-row">
              <button className="provider-connected-toggle" onClick={() => void viewModels(p.id)}>
                <span className="mcp-dot connected" />
                <span className="provider-connected-name">{p.id}</span>
              </button>
              {p.keyRef
                ? <span className="provider-connected-secure" title="Key stored encrypted in OS keychain">🔒 key vaulted</span>
                : p.apiKey
                  ? <span className="provider-connected-secure" title="Key stored in settings (not encrypted)">key {maskKey(p.apiKey)}</span>
                  : null}
              {p.baseUrl && <span className="provider-connected-baseurl">{p.baseUrl}</span>}
              <button className="btn small" onClick={() => void setDefault(p.id)}>
                {settings.defaultProvider === p.id ? 'default' : 'set default'}
              </button>
              <button className="btn small" onClick={() => void disconnect(p.id)}>Disconnect</button>
            </div>
            {expandedId === p.id && (
              <div className="provider-models">
                {models.length > 0 ? models.map(m => <code key={m}>{m}</code>) : <span className="settings-hint">Loading models…</span>}
              </div>
            )}
            {(accounts.find(c => c.providerId === p.id)?.accounts ?? []).map(account => (
              <div className="provider-account-row" key={account.id}>
                <span className={`mcp-dot ${account.status === 'active' ? 'connected' : ''}`} />
                <span>{account.label}</span>
                <span className="settings-hint">{account.authMode} · {account.status}</span>
                <span className="provider-account-quota">
                  {formatAccountQuota(usageByAccount[account.id])}
                </span>
                <button className="btn small" onClick={() => void window.api.refreshProviderUsage(p.id, account.id)}>Refresh quota</button>
                <button className="btn small" onClick={() => void window.api.setProviderAccountEnabled(account.id, account.status !== 'active').then(refreshAccounts)}>
                  {account.status === 'active' ? 'Disable' : 'Enable'}
                </button>
                <button className="btn small" onClick={() => void window.api.removeProviderAccount(account.id).then(refreshAccounts)}>Remove</button>
              </div>
            ))}
          </div>
        ))}
        {visibleProviders.length === 0 && <p className="settings-hint">No providers connected yet.</p>}
      </div>

      {status && <div className="settings-status">{status}</div>}

      {modal && (
        <Modal
          title={modal.kind === 'catalog' ? `Connect ${modal.name}` : 'Connect provider'}
          onClose={() => setModal(null)}
          onSubmit={() => void connect()}
          submitLabel="Connect"
          submitDisabled={!providerId.trim() || !apiKey.trim()}
        >
          {modal.kind === 'catalog' ? (
            <p className="settings-hint">
              Provider <code>{modal.id}</code> — enter your API key below. It will be stored encrypted
              in the OS keychain.
            </p>
          ) : (
            <input
              className="input"
              placeholder="provider id (e.g. deepseek)"
              value={providerId}
              onChange={e => setProviderId(e.target.value)}
            />
          )}
          <input
            className="input provider-key"
            type="password"
            placeholder="api key"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <input
            className="input provider-baseurl"
            placeholder="baseUrl (optional)"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
          />
        </Modal>
      )}
    </div>
  )
}

function formatAccountQuota(usage?: ProviderUsage): string {
  if (!usage) return 'Quota unavailable'
  if (usage.status === 'unavailable') return usage.unavailableReason ?? 'Quota unavailable'
  const primary = usage.primaryUsedPercent !== undefined
    ? `${usage.primaryUsedPercent}% used`
    : usage.tokensUsed !== undefined
    ? `${usage.tokensUsed.toLocaleString()}${usage.tokenLimit ? ` / ${usage.tokenLimit.toLocaleString()}` : ''}`
    : '—'
  const banked = usage.secondaryUsedPercent !== undefined
    ? ` · banked ${usage.secondaryUsedPercent}% used`
    : usage.bankedUsed !== undefined ? ` · banked ${usage.bankedUsed.toLocaleString()}${usage.bankedLimit ? ` / ${usage.bankedLimit.toLocaleString()}` : ''}` : ''
  const reset = usage.resetAt ? ` · reset ${formatCountdown(usage.resetAt)}` : ''
  return `${primary}${banked}${reset}`
}

function formatCountdown(resetAt: number): string {
  const seconds = Math.max(0, Math.round((resetAt - Date.now()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
