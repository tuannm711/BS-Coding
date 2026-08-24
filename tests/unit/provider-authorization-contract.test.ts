import { describe, expect, it } from 'vitest'
import { sanitizeProviderAuthorizationSession, type ProviderAuthorizationSession } from '../../src/shared/providers'

describe('provider authorization contract', () => {
  it('exposes public session metadata without OAuth secrets', () => {
    const session: ProviderAuthorizationSession = {
      loginId: 'login-1',
      providerId: 'openai',
      methodId: 'oauth',
      authUrl: 'https://auth.example/authorize',
      expiresAt: 123,
      status: 'waiting'
    }

    expect(Object.keys(sanitizeProviderAuthorizationSession({
      ...session,
      verifier: 'secret-verifier',
      accessToken: 'secret-token'
    })).sort()).toEqual([
      'authUrl',
      'expiresAt',
      'loginId',
      'methodId',
      'providerId',
      'status'
    ])
    expect(sanitizeProviderAuthorizationSession({ ...session, verifier: 'secret' })).not.toHaveProperty('verifier')
    expect(sanitizeProviderAuthorizationSession({ ...session, accessToken: 'secret' })).not.toHaveProperty('accessToken')
  })
})
