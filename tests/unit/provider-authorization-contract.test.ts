import { describe, expect, it } from 'vitest'
import { sanitizeProviderAuthorizationSession, type ProviderAuthorizationSession } from '../../src/shared/providers'

describe('provider authorization contract', () => {
  it('omits OAuth verifier, expectedState, and callbackUrl from sanitized session', () => {
    const session = {
      loginId: 'login-1',
      providerId: 'openai',
      methodId: 'oauth',
      authUrl: 'https://auth.example/authorize',
      expiresAt: 123,
      verifier: 'verifier-secret',
      expectedState: 'state-secret',
      callbackUrl: 'http://localhost',
      status: 'waiting' as const
    }

    const sanitized = sanitizeProviderAuthorizationSession(session as any)
    expect((sanitized as any).verifier).toBeUndefined()
    expect((sanitized as any).expectedState).toBeUndefined()
    expect((sanitized as any).callbackUrl).toBeUndefined()
    expect(sanitized.loginId).toBe('login-1')
    expect(sanitized.status).toBe('waiting')
  })
})
