import { describe, expect, it } from 'vitest'
import React from 'react'
import type { ProviderAccountSnapshot, ProviderSnapshot } from '../../src/shared/provider-state'
import { buildQuotaRows, quotaSelectedAgentLabel } from '../../src/renderer/src/components/RightPanelQuota'
import { quotaAccountState } from '../../src/renderer/src/components/quota/quota-view'
import * as quotaModule from '../../src/renderer/src/components/RightPanelQuota'
import { renderToStaticMarkup } from 'react-dom/server'
import QuotaAccountCard from '../../src/renderer/src/components/quota/QuotaAccountCard'

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
  it('renders a compact provider card with every reported window and only BS lifecycle actions', () => {
    const providerAccount = account({
      profile: { email: 'pro@example.com', planName: 'PRO' },
      models: [
        { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)', discoveredAt: 1 },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', discoveredAt: 1 }
      ],
      usage: { accountId: 'account-1', refreshedAt: 100, source: 'provider', status: 'ok' }
    })
    const groups = [
      { id: 'gemini', label: 'Gemini Models', modelIds: ['gemini-3.1-pro-high'], windows: [{ id: 'g-5h', label: '5-hour', kind: 'session' as const, remainingPercent: 70, resetAt: 200, usageKnown: true, source: 'provider' as const }] },
      { id: 'claude-gpt', label: 'Claude and GPT models', modelIds: ['claude-sonnet-4-6'], windows: [{ id: 'c-weekly', label: 'Weekly', kind: 'weekly' as const, remainingPercent: 30, resetAt: 300, usageKnown: true, source: 'provider' as const }] }
    ]
    const html = renderToStaticMarkup(<QuotaAccountCard
      account={providerAccount}
      providerLabel="Antigravity IDE"
      groups={groups}
      tracked={{ periodKey: 'weekly', periodStart: 1, requests: 2, tokensInput: 120, tokensCache: 20, tokensOutput: 30, estimatedBilled: 0.04, source: 'bs-tracked' }}
      variant="provider"
      onRefresh={() => {}}
      onReconnect={() => {}}
      onAccountToggle={() => {}}
      onRemove={() => {}}
    />)

    expect(html).toContain('pro@example.com')
    expect(html).toContain('Gemini Models')
    expect(html).toContain('Claude and GPT models')
    expect(html).toContain('aria-valuenow="70"')
    expect(html).toContain('BS tracked')
    expect(html).toContain('Refresh')
    expect(html).toContain('Reconnect')
    expect(html).toContain('Deactivate')
    expect(html).toContain('Remove')
    expect(html).not.toContain('Account billed')
  })

  it('renders chat session controls and metrics without provider lifecycle actions', () => {
    const html = renderToStaticMarkup(<QuotaAccountCard
      account={account({ profile: { email: 'pro@example.com', planName: 'PRO' } })}
      providerLabel="Antigravity IDE"
      groups={[{ id: 'gemini', label: 'Gemini Models', modelIds: ['gemini-3.1-pro-high'], windows: [{ id: 'g', label: 'Session', kind: 'session', remainingPercent: 80, usageKnown: true, source: 'provider' }] }]}
      agents={[{ id: 'agent-1', name: 'Reviewer', assignment: { provider: 'antigravity', accountId: 'account-1', model: 'gemini-3.1-pro-high', speed: 'fast' }, modelLabel: 'Gemini 3.1 Pro (High)' }]}
      session={{ input: 10, output: 2, estimatedCost: 0.01 }}
      variant="chat"
      onSpeedChange={() => {}}
    />)

    expect(html).toContain('Reviewer')
    expect(html).toContain('Gemini 3.1 Pro (High)')
    expect(html).toContain('Session estimate')
    expect(html).toContain('Standard')
    expect(html).toContain('Fast')
    expect(html).not.toContain('Reconnect')
    expect(html).not.toContain('Deactivate')
    expect(html).not.toContain('Remove')
  })

  it('updates the displayed model directly from the latest assignment snapshot', () => {
    const agents = [{ id: 'agent-1', name: 'Reviewer' }]
    expect(buildQuotaRows(agents, snapshot('model-a'), {})[0].agents[0].assignment?.model).toBe('model-a')
    expect(buildQuotaRows(agents, snapshot('model-b'), {})[0].agents[0].assignment?.model).toBe('model-b')
  })

  it('projects the selected Agent model independently from session totals', () => {
    const next = snapshot('gemini-3.1-pro-high')
    next.accounts[0].models = [{ id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro', discoveredAt: 1 }]
    const rows = buildQuotaRows([{ id: 'agent-1', name: 'Reviewer' }], next, {})
    expect(quotaSelectedAgentLabel(rows)).toBe('Gemini 3.1 Pro')
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
    expect(quotaAccountState(account({ usage: { accountId: 'account-1', refreshedAt: 1, source: 'provider', status: 'ok', statusReason: 'Quota exhausted', resetAt: 20 } }), 10)).toBe('cooldown')
  })

  it('shows both the countdown and the exact reset instant', () => {
    const resetAt = new Date(2026, 7, 25, 19, 9, 2).getTime()
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, {
      account: account(), variant: 'chat',
      groups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session', remainingPercent: 70, resetAt, usageKnown: true, source: 'provider' }] }]
    } as never))
    expect(markup).toContain('19:09:02 25/08/2026')
    expect(markup).toContain('Next reset')
  })

  it('does not print an exhaustion warning while a group still has quota', () => {
    const usage = { accountId: 'account-1', refreshedAt: 1, source: 'provider' as const, status: 'ok' as const, statusReason: 'Quota exhausted', quotaGroups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session' as const, remainingPercent: 94, resetAt: 200, usageKnown: true, source: 'provider' as const }] }] }
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, { account: account({ usage }), variant: 'chat', groups: usage.quotaGroups } as never))
    expect(markup).not.toContain('Quota exhausted')
  })

  it('keeps the account state ready while a group still has quota', () => {
    const usage = { accountId: 'account-1', refreshedAt: 1, source: 'provider' as const, status: 'ok' as const, statusReason: 'Quota exhausted', resetAt: 20, quotaGroups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session' as const, remainingPercent: 94, resetAt: 200, usageKnown: true, source: 'provider' as const }] }] }
    expect(quotaAccountState(account({ usage }), 10)).toBe('ready')
  })

  it('still reports cooldown when every window is drained', () => {
    const usage = { accountId: 'account-1', refreshedAt: 1, source: 'provider' as const, status: 'ok' as const, statusReason: 'Quota exhausted', resetAt: 20, quotaGroups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session' as const, remainingPercent: 0, resetAt: 200, usageKnown: true, source: 'provider' as const }] }] }
    expect(quotaAccountState(account({ usage }), 10)).toBe('cooldown')
  })

  it('shows the tracked request count in the chat panel', () => {
    const tracked = { periodKey: 'weekly:1', periodStart: 1, requests: 603, tokensInput: 0, tokensCache: 0, tokensOutput: 0, estimatedBilled: 0, source: 'bs-tracked' as const }
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, { account: account(), variant: 'chat', groups: [], tracked } as never))
    expect(markup).toContain('Requests')
    expect(markup).toContain('603')
  })

  it('does not report exhaustion from a group-scoped provider error while another group has quota', () => {
    const usage = { accountId: 'account-1', refreshedAt: 1, source: 'provider' as const, status: 'ok' as const, quotaGroups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session' as const, remainingPercent: 94, resetAt: 200, usageKnown: true, source: 'provider' as const }] }] }
    const error = { kind: 'quota-exhausted' as const, message: 'Antigravity request failed (429): model claude-sonnet-4-6', updatedAt: 1 }
    expect(quotaAccountState(account({ usage, error }), 10)).toBe('ready')
  })

  it('still reports exhaustion from a provider error once every window is drained', () => {
    const usage = { accountId: 'account-1', refreshedAt: 1, source: 'provider' as const, status: 'ok' as const, quotaGroups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session' as const, remainingPercent: 0, resetAt: 200, usageKnown: true, source: 'provider' as const }] }] }
    const error = { kind: 'quota-exhausted' as const, message: 'x', updatedAt: 1 }
    expect(quotaAccountState(account({ usage, error }), 10)).toBe('quota-exhausted')
  })

  it('reports exhaustion from a provider error when no quota windows are known at all', () => {
    const error = { kind: 'quota-exhausted' as const, message: 'x', updatedAt: 1 }
    expect(quotaAccountState(account({ error }), 10)).toBe('quota-exhausted')
  })
})

describe('quota card actions', () => {
  const card = (variant: 'chat' | 'provider') => renderToStaticMarkup(React.createElement(QuotaAccountCard, {
    account: account(), groups: [], variant, onRefresh: () => {}
  }))

  it('offers a refresh control on the chat card', () => {
    expect(card('chat')).toContain('Refresh')
  })

  it('keeps account management off the chat card', () => {
    // The chat frame is not where accounts are managed, and a destructive
    // control does not belong beside a running conversation.
    const markup = card('chat')
    expect(markup).not.toContain('Reconnect')
    expect(markup).not.toContain('Remove')
    expect(markup).not.toContain('Deactivate')
  })

  it('still offers every provider control on the provider card', () => {
    const markup = card('provider')
    for (const label of ['Refresh', 'Reconnect', 'Remove']) expect(markup).toContain(label)
  })
})
