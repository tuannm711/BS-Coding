import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeGitHubCopilotUsage } from '../../src/main/providers/github-copilot-usage'
import { createGitHubCopilotAdapter } from '../../src/main/providers/adapters/github-copilot'
import { normalizeProviderImport } from '../../src/main/providers/auth/import-normalizer'
import { hasRemainingQuota } from '../../src/renderer/src/components/quota/quota-view'
import { poolState } from '../../src/shared/quota-pool'

const account = { id: 'copilot-a', providerId: 'github-copilot', label: 'Copilot account', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }
afterEach(() => vi.unstubAllGlobals())

describe('Copilot account quota', () => {
  it('reads premium counts, chat/completion unlimited flags, reset and reported credits without inventing balance', () => {
    const usage = normalizeGitHubCopilotUsage(account, { copilot_plan: 'pro', quota_reset_date: '2026-11-01', quota_snapshots: {
      premium_interactions: { entitlement: 300, quota_remaining: 240, percent_remaining: 80, unlimited: false, credits_used: 12.5 },
      chat: { unlimited: true, entitlement: 0, percent_remaining: 100 }, completions: { unlimited: true }
    } }, 123)
    expect(usage).toMatchObject({ accountId: 'copilot-a', planName: 'pro', refreshedAt: 123, status: 'ok', source: 'provider', primaryUsedPercent: 20, requestsUsed: 60, requestLimit: 300, creditsUsed: 12.5, resetAt: Date.parse('2026-11-01T00:00:00Z') })
    expect(usage.quotaGroups?.[0].windows).toMatchObject([
      { label: 'Premium requests', remainingCount: 240, limitCount: 300, usedCount: 60, remainingPercent: 80, usageKnown: true },
      { label: 'Chat', unlimited: true, usageKnown: true }, { label: 'Completions', unlimited: true, usageKnown: true }
    ])
    expect((usage as any).creditBalance).toBeUndefined()
  })
  it('derives count ratio only from reported counts and keeps malformed/missing values unknown', () => {
    const usage = normalizeGitHubCopilotUsage(account, { quota_snapshots: { premium_interactions: { entitlement: 100, quota_remaining: 25 }, chat: { percent_remaining: '100' } }, quota_reset_date: 'not-a-date' })
    expect(usage.quotaGroups?.[0].windows[0]).toMatchObject({ remainingPercent: 25, remainingCount: 25, limitCount: 100 })
    expect(usage.quotaGroups?.[0].windows[1].usageKnown).toBe(false)
    expect(usage.resetAt).toBeUndefined()
    expect(normalizeGitHubCopilotUsage(account, {}).status).toBe('unavailable')
  })
  it('does not turn token-billing placeholder zero quotas into exhaustion or an invented credit allowance', () => {
    const usage = normalizeGitHubCopilotUsage(account, { token_based_billing: true, quota_snapshots: { premium_interactions: { entitlement: 0, quota_remaining: 0, percent_remaining: 0, credits_used: 0 } } })
    expect(usage.creditsUsed).toBe(0)
    expect(usage.quotaGroups?.[0].windows[0].usageKnown).toBe(false)
    expect(usage.primaryUsedPercent).toBeUndefined()
  })
  it('treats unlimited as available without a fake percentage or blocking every model when premium requests are exhausted', () => {
    const usage = normalizeGitHubCopilotUsage(account, { quota_snapshots: { premium_interactions: { entitlement: 300, quota_remaining: 0, percent_remaining: 0 }, chat: { unlimited: true } } })
    expect(hasRemainingQuota(usage)).toBe(true)
    expect(poolState(usage.quotaGroups![0], undefined)).toBe('ok')
    expect(usage.quotaGroups![0].windows[1].remainingPercent).toBeUndefined()
  })
  it('supports documented SDK-style counts and clamps explicit negative remaining percentage', () => {
    const usage = normalizeGitHubCopilotUsage(account, { quotaSnapshots: { premium_interactions: { entitlementRequests: 300, usedRequests: 90, remainingPercentage: 70, resetDate: '2026-11-01' }, chat: { percent_remaining: -5 } } })
    expect(usage.quotaGroups![0].windows[0]).toMatchObject({ remainingCount: 210, usedCount: 90, remainingPercent: 70 })
    expect(usage.quotaGroups![0].windows[1].remainingPercent).toBe(0)
  })
  it.each([{ quota_remaining: 200 }, { remainingRequests: 200 }, { quota_remaining: 0 }])('treats a reported remaining count as fresh quota without inventing percentage/allowance: %j', snapshot => {
    const usage = normalizeGitHubCopilotUsage(account, { quota_snapshots: { premium_interactions: snapshot } })
    expect(usage.status).toBe('ok')
    expect(usage.source).toBe('provider')
    const window = usage.quotaGroups![0].windows[0]
    expect(window.usageKnown).toBe(true)
    expect(window.remainingPercent).toBeUndefined()
    expect(window.limitCount).toBeUndefined()
  })
  it('fetches quota with the GitHub identity token, supported version and a bounded timeout', async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => Response.json({ quota_snapshots: { premium_interactions: { entitlement: 300, quota_remaining: 300 } } }))
    vi.stubGlobal('fetch', fetch)
    const adapter = createGitHubCopilotAdapter()
    const usage = await adapter.fetchUsage!(account, { githubAccessToken: 'identity-token', accessToken: 'runtime-token' })
    expect(fetch.mock.calls[0][0]).toBe('https://api.github.com/copilot_internal/user')
    const request = fetch.mock.calls[0][1]!
    expect(new Headers(request.headers).get('authorization')).toBe('token identity-token')
    expect(new Headers(request.headers).get('x-github-api-version')).toBe('2022-11-28')
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(usage.quotaGroups?.[0].windows[0].remainingCount).toBe(300)
  })
  it('does not send a Copilot runtime credential to the GitHub account quota endpoint', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const usage = await createGitHubCopilotAdapter().fetchUsage!(account, { accessToken: 'runtime-token' })
    expect(usage.status).toBe('unavailable')
    expect(usage.statusReason).toMatch(/OAuth|reconnect/i)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retains an explicitly imported GitHub identity token for quota requests', () => {
    expect(normalizeProviderImport('github-copilot', JSON.stringify({ accessToken: 'runtime-token', githubAccessToken: 'identity-token' })).githubAccessToken).toBe('identity-token')
  })
})
