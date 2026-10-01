import { describe, expect, it } from 'vitest'
import { sanitizeProviderAuthorizationSession, type ProviderAuthorizationSession } from '../../src/shared/providers'

describe('provider authorization contract', () => {
  it('preserves the user verification code and strips the private device grant', () => {
    const sanitized = sanitizeProviderAuthorizationSession({ loginId: 'device', providerId: 'github-copilot', methodId: 'oauth', authUrl: 'https://github.com/login/device', expiresAt: 123, status: 'waiting', userCode: 'ABCD-EFGH', deviceCode: 'private-device' })
    expect(sanitized.userCode).toBe('ABCD-EFGH')
    expect(JSON.stringify(sanitized)).not.toContain('private-device')
  })
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
