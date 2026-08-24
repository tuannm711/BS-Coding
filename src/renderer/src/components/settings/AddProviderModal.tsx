import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AuthMethodKind,
  ProviderAuthorizationSession,
  ProviderConnectRequest
} from '@shared/providers'
import type { ProviderAccountSnapshot, ProviderDefinitionSnapshot } from '@shared/provider-state'
import Modal from './Modal'

interface Props {
  providers?: ProviderDefinitionSnapshot[]
  reconnectAccount?: ProviderAccountSnapshot
  onClose(): void
  onConnected(message: string): void
}

interface AuthorizationViewInput {
  methodKind?: AuthMethodKind
  session: ProviderAuthorizationSession | null
  now: number
}

export function authorizationView({ methodKind, session, now }: AuthorizationViewInput) {
  const oauth = methodKind === 'oauth'
  return {
    showCreate: oauth && session === null,
    showWaitingActions: oauth && session?.status === 'waiting',
    showRegenerate: oauth && Boolean(session && ['expired', 'error', 'cancelled'].includes(session.status)),
    secondsLeft: session ? Math.max(0, Math.ceil((session.expiresAt - now) / 1_000)) : 0
  }
}

export function reduceAuthorizationState(
  current: ProviderAuthorizationSession | null,
  event: ProviderAuthorizationSession
): ProviderAuthorizationSession | null {
  if (!current || current.loginId !== event.loginId) return current
  return event
}

export function connectionNotificationLoginId(
  session: ProviderAuthorizationSession | null,
  notifiedLoginId: string | null
): string | null {
  return session?.status === 'connected' && session.loginId !== notifiedLoginId ? session.loginId : null
}

export function availableProviderMethods(providers: ProviderDefinitionSnapshot[], providerId: string) {
  return providers.find(provider => provider.id === providerId)?.methods ?? []
}

export function reconnectMethodId(provider: ProviderDefinitionSnapshot, authMode: ProviderAccountSnapshot['authMode']) {
  const kind = authMode === 'oauth' ? 'oauth' : authMode === 'api-key' ? 'api-key' : 'imported'
  return provider.methods.find(method => method.kind === kind)?.id ?? provider.methods[0]?.id ?? ''
}

export default function AddProviderModal({ providers, reconnectAccount, onClose, onConnected }: Props) {
  const [capabilities, setCapabilities] = useState<ProviderDefinitionSnapshot[]>(providers ?? [])
  const [providerId, setProviderId] = useState('')
  const [methodId, setMethodId] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState<ProviderAuthorizationSession | null>(null)
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState(false)
  const connectedNotificationRef = useRef<string | null>(null)
  const callbacksRef = useRef({ onClose, onConnected })
  const capabilitiesRef = useRef(capabilities)
  callbacksRef.current = { onClose, onConnected }
  capabilitiesRef.current = capabilities

  useEffect(() => {
    const apply = (next: ProviderDefinitionSnapshot[]) => {
      setCapabilities(next)
      const selected = reconnectAccount ? next.find(item => item.id === reconnectAccount.providerId) : next[0]
      if (selected) {
        setProviderId(selected.id)
        setMethodId(reconnectAccount ? reconnectMethodId(selected, reconnectAccount.authMode) : selected.methods[0]?.id ?? '')
      }
    }
    if (providers && providers.length > 0) apply(providers)
    else void window.api.getProviderSnapshot().then(snapshot => apply(snapshot.providers))
  }, [providers, reconnectAccount])

  useEffect(() => window.api.onProviderAuthorizationChanged(event => {
    setSession(current => reduceAuthorizationState(current, event))
  }), [])

  useEffect(() => {
    if (session?.status !== 'waiting') return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [session?.status, session?.loginId])

  useEffect(() => {
    if (session?.status !== 'connected') return
    const notificationLoginId = connectionNotificationLoginId(session, connectedNotificationRef.current)
    if (notificationLoginId) {
      connectedNotificationRef.current = notificationLoginId
      callbacksRef.current.onConnected(`Connected ${capabilitiesRef.current.find(item => item.id === session.providerId)?.displayName ?? session.providerId}.`)
    }
    const timer = window.setTimeout(() => callbacksRef.current.onClose(), 600)
    return () => window.clearTimeout(timer)
  }, [session?.status, session?.loginId, session?.providerId])

  const provider = capabilities.find(item => item.id === providerId)
  const method = provider?.methods.find(item => item.id === methodId)
  const requiredFields = method?.fields ?? []
  const canSubmit = Boolean(provider && method && requiredFields.every(field => field === 'baseUrl' || fields[field]?.trim()))
  const title = useMemo(
    () => provider ? `${reconnectAccount ? 'Reconnect' : 'Add'} ${provider.displayName}` : 'Add provider',
    [provider, reconnectAccount]
  )
  const view = authorizationView({ methodKind: method?.kind, session, now })

  const submitCredentials = async () => {
    if (!provider || !method || !canSubmit) return
    setBusy(true)
    setError('')
    try {
      const request: ProviderConnectRequest = {
        providerId,
        methodId,
        reconnectAccountId: reconnectAccount?.id,
        fields
      }
      await window.api.connectProviderMethod(request)
      onConnected(`Connected ${provider.displayName}.`)
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const createAuthorization = async () => {
    if (!provider || !method || method.kind !== 'oauth' || busy) return
    setBusy(true)
    setError('')
    setCopied(false)
    setSession(null)
    try {
      const next = await window.api.createProviderAuthorization({
        providerId,
        methodId,
        reconnectAccountId: reconnectAccount?.id
      })
      setSession(next)
      setNow(Date.now())
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const cancelAuthorization = async (closeAfter = false) => {
    if (session?.status === 'waiting') {
      const next = await window.api.cancelProviderAuthorization(session.loginId)
      if (next) setSession(next)
    }
    if (closeAfter) onClose()
  }

  const close = () => {
    if (session?.status === 'waiting') void cancelAuthorization(true)
    else onClose()
  }

  const copyLink = async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(session.authUrl)
      setCopied(true)
    } catch {
      setError('Unable to copy the authorization link.')
    }
  }

  const openBrowser = async () => {
    if (!session) return
    try {
      await window.api.openProviderAuthorization(session.loginId)
    } catch (err) {
      setError(String(err))
    }
  }

  const authorizationVisible = method?.kind === 'oauth' && session !== null
  const defaultSubmit = method?.kind === 'oauth' ? () => void createAuthorization() : () => void submitCredentials()
  const submitLabel = method?.kind === 'oauth'
    ? (busy ? 'Creating…' : 'Create authorization link')
    : (busy ? 'Connecting…' : 'Continue')

  return (
    <Modal
      title={title}
      onClose={close}
      onSubmit={authorizationVisible ? undefined : defaultSubmit}
      submitLabel={submitLabel}
      submitDisabled={!canSubmit || busy}
      showDefaultActions={!authorizationVisible}
    >
      <label className="settings-field-label" htmlFor="provider-select">Provider</label>
      <select
        id="provider-select"
        className="input"
        value={providerId}
        disabled={Boolean(reconnectAccount) || session?.status === 'waiting'}
        onChange={event => {
          const next = capabilities.find(item => item.id === event.target.value)
          setProviderId(event.target.value)
          setMethodId(next?.methods[0]?.id ?? '')
          setFields({})
          setSession(null)
        }}
      >
        {capabilities.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
      </select>
      {provider && <p className="settings-hint">{provider.description}</p>}
      <label className="settings-field-label" htmlFor="provider-method">Connection method</label>
      <select
        id="provider-method"
        className="input"
        value={methodId}
        disabled={session?.status === 'waiting'}
        onChange={event => {
          setMethodId(event.target.value)
          setFields({})
          setSession(null)
          setError('')
        }}
      >
        {provider?.methods.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      {method?.kind === 'oauth' && !session && (
        <p className="settings-hint">Create a secure link, then copy it or open it when you are ready.</p>
      )}
      {method && method.kind !== 'oauth' && requiredFields.map(field => (
        <input
          key={field}
          className="input"
          type={field.toLowerCase().includes('key') ? 'password' : 'text'}
          placeholder={field === 'credentialJson' ? 'Paste credential JSON' : field}
          value={fields[field] ?? ''}
          onChange={event => setFields(previous => ({ ...previous, [field]: event.target.value }))}
        />
      ))}
      {method && method.kind !== 'oauth' && (
        <input
          className="input"
          placeholder="account label (optional)"
          value={fields.label ?? ''}
          onChange={event => setFields(previous => ({ ...previous, label: event.target.value }))}
        />
      )}
      {session && (
        <section className={`authorization-session ${session.status}`} aria-live="polite">
          <div className="authorization-session-head">
            <strong>{session.status === 'waiting' ? 'Waiting for authorization' : session.status}</strong>
            {session.status === 'waiting' && <span className="authorization-countdown">{view.secondsLeft}s</span>}
          </div>
          <input className="input authorization-url" aria-label="Authorization link" readOnly value={session.authUrl} />
          {view.showWaitingActions && (
            <div className="authorization-actions">
              <button className="btn" onClick={() => void copyLink()}>{copied ? 'Copied' : 'Copy link'}</button>
              <button className="btn primary" onClick={() => void openBrowser()}>Open browser</button>
              <button className="btn" onClick={() => void cancelAuthorization(true)}>Cancel</button>
            </div>
          )}
          {session.error && <div className="settings-status error" role="alert">{session.error.message}</div>}
          {session.status === 'connected' && <div className="settings-status settings-status-ok">Account connected.</div>}
          {view.showRegenerate && (
            <div className="authorization-actions">
              <button className="btn primary" disabled={busy} onClick={() => void createAuthorization()}>Generate new link</button>
              <button className="btn" onClick={close}>Close</button>
            </div>
          )}
        </section>
      )}
      {error && <div className="settings-status error" role="alert">{error}</div>}
    </Modal>
  )
}
