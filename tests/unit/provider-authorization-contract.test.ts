import { describe, expect, it } from 'vitest'
import { sanitizeProviderAuthorizationSession, type ProviderAuthorizationSession } from '../../src/shared/providers'

describe('provider authorization contract', () => {
  it('clears OAuth verifier and expectedState from sanitized session', () => {
    const session: ProviderAuthorizationSession = {
      loginId: 'login-1',
      providerId: 'openai',
      methodId: 'oauth',
      authUrl: 'https://auth.example/authorize',
      expiresAt: 123,
      verifier: 'verifier-secret',
      expectedState: 'state-secret',
      callbackUrl: 'http://localhost',
      status: 'waiting'
    }

    const sanitized = sanitizeProviderAuthorizationSession(session)
    expect(sanitized.verifier).toBe('')
    expect(sanitized.expectedState).toBe('')
    expect(sanitized.loginId).toBe('login-1')
  })
})
