import { describe, expect, it } from 'vitest'
import {
  authorizationView,
  connectionNotificationLoginId,
  reduceAuthorizationState
} from '../../src/renderer/src/components/settings/AddProviderModal'
import type { ProviderAuthorizationSession } from '../../src/shared/providers'

const waitingSession: ProviderAuthorizationSession = {
  loginId: 'login-1',
  providerId: 'openai',
  methodId: 'oauth',
  authUrl: 'https://auth.example/authorize',
  expiresAt: 61_000,
  status: 'waiting'
}

describe('provider authorization modal view', () => {
  it('shows create only for OAuth and waiting actions only after creation', () => {
    expect(authorizationView({ methodKind: 'api-key', session: null, now: 1_000 })).toMatchObject({ showCreate: false })
    expect(authorizationView({ methodKind: 'oauth', session: null, now: 1_000 })).toMatchObject({ showCreate: true, showWaitingActions: false })
    expect(authorizationView({ methodKind: 'oauth', session: waitingSession, now: 1_000 })).toMatchObject({
      showCreate: false,
      showWaitingActions: true,
      secondsLeft: 60
    })
  })

  it('shows regeneration for expired and retryable error sessions', () => {
    expect(authorizationView({ methodKind: 'oauth', session: { ...waitingSession, status: 'expired' }, now: 61_000 }).showRegenerate).toBe(true)
    expect(authorizationView({ methodKind: 'oauth', session: { ...waitingSession, status: 'error', error: { kind: 'token-exchange-failed', message: 'Failed' } }, now: 1_000 }).showRegenerate).toBe(true)
  })

  it('ignores events for another login id', () => {
    expect(reduceAuthorizationState(null, waitingSession)).toBeNull()
    expect(reduceAuthorizationState(waitingSession, { ...waitingSession, loginId: 'other', status: 'connected' })).toBe(waitingSession)
    expect(reduceAuthorizationState(waitingSession, { ...waitingSession, status: 'connected' })?.status).toBe('connected')
  })

  it('notifies a connected authorization session only once per login id', () => {
    const connected = { ...waitingSession, status: 'connected' as const }

    expect(connectionNotificationLoginId(connected, null)).toBe('login-1')
    expect(connectionNotificationLoginId(connected, 'login-1')).toBeNull()
    expect(connectionNotificationLoginId({ ...connected, loginId: 'login-2' }, 'login-1')).toBe('login-2')
    expect(connectionNotificationLoginId(waitingSession, null)).toBeNull()
  })
})
