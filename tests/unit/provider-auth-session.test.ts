import { describe, expect, it, vi } from 'vitest'
import { AuthSessionCoordinator } from '../../src/main/providers/auth/session'

function input(close = vi.fn()) {
  return {
    providerId: 'openai',
    methodId: 'oauth',
    authUrl: 'https://auth.example/authorize',
    expiresAt: 2_000,
    verifier: 'secret-verifier',
    expectedState: 'expected-state',
    callbackUrl: 'http://127.0.0.1:1455/auth/callback',
    close
  }
}

describe('provider auth sessions', () => {
  it('isolates provider sessions and exposes only public state', () => {
    const sessions = new AuthSessionCoordinator(() => 1_000)
    const first = sessions.start(input())
    const second = sessions.start({ ...input(), providerId: 'antigravity', authUrl: 'https://google.example/authorize' })

    expect(first.loginId).not.toBe(second.loginId)
    expect(sessions.public(first.loginId)).not.toHaveProperty('verifier')
    expect(sessions.pending(first.loginId)?.verifier).toBe('secret-verifier')
    expect(sessions.pending(second.loginId)?.providerId).toBe('antigravity')
  })

  it('closes once and rejects late completion after cancellation', () => {
    const close = vi.fn()
    const sessions = new AuthSessionCoordinator(() => 1_000)
    const session = sessions.start(input(close))

    expect(sessions.cancel(session.loginId)?.status).toBe('cancelled')
    expect(sessions.complete(session.loginId, 'account-1')).toBeUndefined()
    expect(sessions.pending(session.loginId)).toBeUndefined()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('expires a pending session and clears its secrets', () => {
    let now = 1_000
    const close = vi.fn()
    const sessions = new AuthSessionCoordinator(() => now)
    const session = sessions.start(input(close))

    now = 2_001

    expect(sessions.pending(session.loginId)).toBeUndefined()
    expect(sessions.public(session.loginId)?.status).toBe('expired')
    expect(close).toHaveBeenCalledTimes(1)
  })
})
