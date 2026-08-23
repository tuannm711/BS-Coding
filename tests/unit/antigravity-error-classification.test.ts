import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyProviderError } from '../../src/shared/provider-state'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'

describe('Antigravity error classification', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('keeps quota, capacity and auth states distinct', () => {
    expect(classifyProviderError(429, 'RESOURCE_EXHAUSTED').kind).toBe('quota-exhausted')
    expect(classifyProviderError(429, 'MODEL_CAPACITY_EXHAUSTED').kind).toBe('capacity-exhausted')
    expect(classifyProviderError(503, 'MODEL_OUT_OF_COMPUTE').kind).toBe('capacity-exhausted')
    expect(classifyProviderError(403, 'token expired').kind).toBe('auth')
  })

  it('refreshes an expired OAuth token once before retrying usage', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'new-token', expires_in: 3600 }), { status: 200 })
      if (calls.filter(call => call.includes('retrieveUserQuotaSummary')).length === 1) return new Response('', { status: 401 })
      if (url.includes('retrieveUserQuotaSummary')) return new Response(JSON.stringify({}), { status: 200 })
      if (url.includes('retrieveUserQuota')) return new Response(JSON.stringify({}), { status: 200 })
      return new Response(JSON.stringify({ models: { m: { model: 'gemini-code', quotaInfo: { remainingFraction: 0.5 } } } }), { status: 200 })
    }))
    const secret = { accessToken: 'old-token', refreshToken: 'refresh-token', projectId: 'project-123' }
    const account = { id: 'a1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }

    const usage = await createAntigravityAdapter().fetchUsage!(account, secret)

    expect(usage.status).toBe('ok')
    expect(secret.accessToken).toBe('new-token')
    expect(calls.filter(url => url.includes('retrieveUserQuotaSummary'))).toHaveLength(2)
    expect(calls.filter(url => url.includes('fetchAvailableModels'))).toHaveLength(1)
    expect(calls.filter(url => url.includes('oauth2.googleapis.com/token'))).toHaveLength(1)
  })

  it('uses quota summary, quota, then available models as the fallback order', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes('fetchAvailableModels')) return new Response(JSON.stringify({ models: { m: { model: 'gemini-code', quotaInfo: { remainingFraction: 0.5 } } } }), { status: 200 })
      return new Response(JSON.stringify({}), { status: 200 })
    }))
    const account = { id: 'a1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }

    const usage = await createAntigravityAdapter().fetchUsage!(account, { accessToken: 'token', projectId: 'project-123' })

    expect(usage.status).toBe('ok')
    expect(calls).toEqual([
      'https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary',
      'https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',
      'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels'
    ])
  })

  it('records retry-after as the quota reset without retrying 429', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429, headers: { 'retry-after': '120' } }))
    vi.stubGlobal('fetch', fetchMock)
    const now = Date.now()
    const account = { id: 'a1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }
    const usage = await createAntigravityAdapter().fetchUsage!(account, { accessToken: 'token', projectId: 'project-123' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(usage).toMatchObject({ status: 'near-limit', unavailableReason: 'Quota exhausted' })
    expect(usage.resetAt).toBeGreaterThanOrEqual(now + 119_000)
  })

  it('classifies model-capacity 429 separately from account quota', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED","message":"MODEL_CAPACITY_EXHAUSTED"}}', { status: 429 })))
    const account = { id: 'a1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }

    const usage = await createAntigravityAdapter().fetchUsage!(account, { accessToken: 'token', projectId: 'project-123' })

    expect(usage).toMatchObject({ status: 'near-limit', unavailableReason: 'Model capacity exhausted' })
  })
})
