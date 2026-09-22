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

  it('triggers active timer expiry and notifies onExpired', () => {
    vi.useFakeTimers()
    try {
      let currentTime = 1_000
      const onExpired = vi.fn()
      const close = vi.fn()
      const sessions = new AuthSessionCoordinator({
        now: () => currentTime,
        onExpired
      })

      const session = sessions.start({ ...input(close), expiresAt: 4_000 })
      expect(session.status).toBe('waiting')

      // Advance clock
      currentTime = 4_001
      vi.advanceTimersByTime(3_000)

      expect(onExpired).toHaveBeenCalledTimes(1)
      expect(onExpired.mock.calls[0][0].status).toBe('expired')
      expect(sessions.public(session.loginId)?.status).toBe('expired')
      expect(close).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears active timer on completion and stores accountId', () => {
    vi.useFakeTimers()
    try {
      let currentTime = 1_000
      const onExpired = vi.fn()
      const close = vi.fn()
      const sessions = new AuthSessionCoordinator({
        now: () => currentTime,
        onExpired
      })

      const session = sessions.start({ ...input(close), expiresAt: 5_000 })
      const completed = sessions.complete(session.loginId, 'acc_openai_123')

      expect(completed?.status).toBe('connected')
      expect(completed?.accountId).toBe('acc_openai_123')
      expect(sessions.public(session.loginId)?.accountId).toBe('acc_openai_123')

      // Advance time past expiration
      currentTime = 6_000
      vi.advanceTimersByTime(5_000)

      // Timer should not have triggered expiration
      expect(onExpired).not.toHaveBeenCalled()
      expect(sessions.public(session.loginId)?.status).toBe('connected')
    } finally {
      vi.useRealTimers()
    }
  })
})
