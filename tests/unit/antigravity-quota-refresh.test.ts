import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { parseAntigravityUsage } from '../../src/main/providers/antigravity-models'

describe('Antigravity quota accuracy', () => {
  const mixed = { models: {
    'MODEL_PLACEHOLDER_M18': { model: 'gemini-3-flash', quotaInfo: { remainingFraction: 0.8, resetTime: '2026-08-23T13:00:00Z' } },
    helper: { model: 'autocomplete-lite', quotaInfo: { remainingFraction: 0.01, resetTime: '2026-08-23T11:00:00Z' } }
  } }

  it('reports the headline percentage from grouped models only, ignoring hidden helper models', () => {
    const usage = parseAntigravityUsage('a1', mixed, {}, 1)
    expect(usage.primaryUsedPercent).toBe(20)
    expect(usage.status).toBe('ok')
    expect(usage.resetAt).toBe(Date.parse('2026-08-23T13:00:00Z'))
    expect(usage.statusReason).toBeUndefined()
  })

  it('keeps the headline percentage consistent with the quota group window', () => {
    const usage = parseAntigravityUsage('a1', mixed, {}, 1)
    const window = usage.quotaGroups?.[0]?.windows?.[0]
    expect(window?.remainingPercent).toBe(80)
    expect(usage.primaryUsedPercent).toBe(100 - window!.remainingPercent!)
  })

  it('still falls back to every model when none map to a known quota group', () => {
    expect(parseAntigravityUsage('a1', { models: { m: { quotaInfo: { remainingFraction: 0 } } } }).statusReason).toBe('Quota exhausted')
    expect(parseAntigravityUsage('a1', { models: { m: { quotaInfo: { remainingFraction: 0.5 } } } }).primaryUsedPercent).toBe(50)
  })
})

describe('Antigravity quota auto-refresh on expired credentials', () => {
  afterEach(() => vi.unstubAllGlobals())

  const account = { id: 'acc-1', label: 'pro@example.com', providerId: 'antigravity', authMode: 'oauth', status: 'active' } as never
  const quotaPayload = { response: { groups: [
    { displayName: 'Gemini Models', buckets: [{ bucketId: 'gemini-5h', remaining: { remainingFraction: 0.7 }, resetTime: '2026-08-23T12:00:00Z', description: '5-hour' }] }
  ] } }

  function stubCloudCode(): { calls: string[] } {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const token = String((init?.headers as Record<string, string> | undefined)?.authorization ?? '')
      calls.push(`${url}|${token}`)
      if (url.includes('/token')) return new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'r', expires_in: 3600 }), { status: 200 })
      if (!token.includes('fresh')) return new Response('{"error":"invalid credentials"}', { status: 401 })
      if (url.includes('loadCodeAssist')) return new Response(JSON.stringify({ cloudaicompanionProject: 'proj-1', currentTier: { id: 'pro' } }), { status: 200 })
      if (url.includes('retrieveUserQuotaSummary')) return new Response(JSON.stringify(quotaPayload), { status: 200 })
      return new Response('{}', { status: 404 })
    }))
    return { calls }
  }

  it('refreshes the OAuth token when account context discovery is rejected, instead of failing the whole refresh', async () => {
    const { calls } = stubCloudCode()
    const secret = { accessToken: 'expired', refreshToken: 'r' } as never

    const usage = await createAntigravityAdapter().fetchUsage!(account, secret)

    expect(usage.source).toBe('provider')
    expect(usage.status).toBe('ok')
    expect(usage.quotaGroups?.[0]?.windows?.[0]?.remainingPercent).toBe(70)
    expect(calls.some(call => call.includes('/token'))).toBe(true)
    expect((secret as { accessToken?: string }).accessToken).toBe('fresh')
  })

  it('persists the rediscovered project so the next refresh skips context discovery', async () => {
    stubCloudCode()
    const secret = { accessToken: 'expired', refreshToken: 'r' } as never

    await createAntigravityAdapter().fetchUsage!(account, secret)

    expect((secret as { projectId?: string }).projectId).toBe('proj-1')
    expect((secret as { planName?: string }).planName).toBe('pro')
  })

  it('reports authentication expiry when no refresh token is available', async () => {
    stubCloudCode()
    const usage = await createAntigravityAdapter().fetchUsage!(account, { accessToken: 'expired' } as never)

    expect(usage.status).toBe('unavailable')
    expect(usage.statusReason).toBe('Authentication expired')
  })
})
