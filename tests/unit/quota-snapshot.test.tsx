import { describe, expect, it } from 'vitest'
import type { ProviderAccountSnapshot, ProviderSnapshot } from '../../src/shared/provider-state'
import { buildQuotaRows, quotaAccountState } from '../../src/renderer/src/components/RightPanelQuota'
import * as quotaModule from '../../src/renderer/src/components/RightPanelQuota'

function account(patch: Partial<ProviderAccountSnapshot> = {}): ProviderAccountSnapshot {
  return { id: 'account-1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth', status: 'active', models: [], updatedAt: 1, ...patch }
}

function snapshot(modelId: string): ProviderSnapshot {
  return {
    revision: 1, updatedAt: 1, providers: [], accounts: [account({ usage: { accountId: 'account-1', refreshedAt: 1, source: 'provider', status: 'ok', primaryUsedPercent: 25 } })],
    assignments: [{ agentId: 'agent-1', providerId: 'antigravity', accountId: 'account-1', modelId, speed: 'standard', revision: 1, status: 'ready' }]
  }
}

describe('snapshot-driven quota cards', () => {
  it('updates the displayed model directly from the latest assignment snapshot', () => {
    const agents = [{ id: 'agent-1', name: 'Reviewer' }]
    expect(buildQuotaRows(agents, snapshot('model-a'), {})[0].agents[0].assignment?.model).toBe('model-a')
    expect(buildQuotaRows(agents, snapshot('model-b'), {})[0].agents[0].assignment?.model).toBe('model-b')
  })

  it('groups every assigned agent and model under one account card', () => {
    const next = snapshot('model-a')
    next.assignments.push({ agentId: 'agent-2', providerId: 'antigravity', accountId: 'account-1', modelId: 'model-b', speed: 'fast', revision: 1, status: 'ready' })
    const rows = buildQuotaRows([{ id: 'agent-1', name: 'Reviewer' }, { id: 'agent-2', name: 'Builder' }], next, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].models).toEqual(['model-a', 'model-b'])
    expect(rows[0].agents.map(agent => agent.name)).toEqual(['Reviewer', 'Builder'])
  })

  it('uses the friendly catalog name and selected-model quota in the session card', () => {
    const next = snapshot('MODEL_PLACEHOLDER_M72')
    next.accounts[0].models = [{ id: 'MODEL_PLACEHOLDER_M72', name: 'Gemini 3.6 Flash (Medium)', discoveredAt: 1 }]
    next.accounts[0].usage = {
      accountId: 'account-1', refreshedAt: 1, source: 'provider', status: 'ok', primaryUsedPercent: 0,
      modelQuotas: { MODEL_PLACEHOLDER_M72: { remainingPercent: 25, resetAt: 20 } }
    }

    const row = buildQuotaRows([{ id: 'agent-1', name: 'Reviewer' }], next, {})[0]

    expect(row.agents[0].modelLabel).toBe('Gemini 3.6 Flash (Medium)')
    expect(row.groups).toEqual([{
      id: 'legacy-models', label: 'Model quota', modelIds: ['MODEL_PLACEHOLDER_M72'],
      windows: [{ id: 'legacy-model', label: 'Model quota', kind: 'unknown', remainingPercent: 25, resetAt: 20, usageKnown: true, source: 'legacy-provider' }]
    }])
  })

  it('shows both account families once when selected Agents use Gemini and Claude', () => {
    const next = snapshot('gemini-3.1-pro-high')
    next.assignments.push({ agentId: 'agent-2', providerId: 'antigravity', accountId: 'account-1', modelId: 'claude-sonnet-4-6', speed: 'standard', revision: 1, status: 'ready' })
    next.accounts[0].usage = {
      accountId: 'account-1', refreshedAt: 1, source: 'provider', status: 'ok', quotaGroups: [
        { id: 'gemini', label: 'Gemini Models', modelIds: ['gemini-3.1-pro-high'], windows: [{ id: 'g', label: 'Session', kind: 'session', remainingPercent: 80, usageKnown: true, source: 'provider' }] },
        { id: 'claude-gpt', label: 'Claude and GPT models', modelIds: ['claude-sonnet-4-6'], windows: [{ id: 'c', label: 'Weekly', kind: 'weekly', remainingPercent: 70, usageKnown: true, source: 'provider' }] }
      ]
    }

    const row = buildQuotaRows([{ id: 'agent-1', name: 'Reviewer' }, { id: 'agent-2', name: 'Builder' }], next, {})[0]

    expect(row.groups.map(group => group.id)).toEqual(['gemini', 'claude-gpt'])
  })

  it('rejects an older assignment event for the same agent', () => {
    const current = snapshot('model-new')
    current.assignments[0].revision = 5
    const older = { ...current.assignments[0], modelId: 'model-old', revision: 4 }

    const merged = (quotaModule as unknown as { mergeAssignmentEvent: (state: ProviderSnapshot, event: typeof older) => ProviderSnapshot }).mergeAssignmentEvent(current, older)

    expect(merged.assignments[0]).toMatchObject({ modelId: 'model-new', revision: 5 })
  })

  it('classifies ready, unavailable, exhausted, cooldown, capacity and auth states', () => {
    expect(quotaAccountState(account({ usage: { accountId: 'account-1', refreshedAt: 1, source: 'provider', status: 'ok' } }), 10)).toBe('ready')
    expect(quotaAccountState(account(), 10)).toBe('unavailable')
    expect(quotaAccountState(account({ error: { kind: 'quota-exhausted', message: 'quota', updatedAt: 1 } }), 10)).toBe('quota-exhausted')
    expect(quotaAccountState(account({ error: { kind: 'quota-exhausted', message: 'quota', retryAt: 20, updatedAt: 1 } }), 10)).toBe('cooldown')
    expect(quotaAccountState(account({ error: { kind: 'capacity-exhausted', message: 'capacity', updatedAt: 1 } }), 10)).toBe('capacity-exhausted')
    expect(quotaAccountState(account({ error: { kind: 'auth', message: 'auth', updatedAt: 1 } }), 10)).toBe('auth-error')
    expect(quotaAccountState(account({ usage: { accountId: 'account-1', refreshedAt: 1, source: 'provider', status: 'near-limit', unavailableReason: 'Quota exhausted', resetAt: 20 } }), 10)).toBe('cooldown')
  })
})
