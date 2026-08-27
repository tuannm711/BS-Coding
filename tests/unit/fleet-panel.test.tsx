import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FleetBoard } from '../../src/renderer/src/components/fleet/FleetPanel'
import type { FleetAgentRow, FleetModel } from '../../src/renderer/src/components/fleet/fleet-model'
import type { ProviderAccountSnapshot } from '../../src/shared/provider-state'
import type { ProviderQuotaWindow } from '../../src/shared/types'

const account: ProviderAccountSnapshot = {
  id: 'acc1', providerId: 'antigravity', label: 'bdg', authMode: 'oauth',
  status: 'active', updatedAt: 0, models: []
}

const row = (patch: Partial<FleetAgentRow> = {}): FleetAgentRow =>
  ({ id: 'a1', name: 'anti-claude-opus', mode: 'build', role: 'worker', ...patch })

const pool = (id: string, agents: FleetAgentRow[], windows: ProviderQuotaWindow[] = []) => ({
  group: { id, label: id, modelIds: [], windows },
  agents
})

const window = (patch: Partial<ProviderQuotaWindow> = {}): ProviderQuotaWindow => ({
  id: 'w1', label: 'Weekly', kind: 'weekly', remainingPercent: 93,
  resetAt: Date.parse('2026-08-30T12:00:00Z'), usageKnown: true, source: 'provider', ...patch
})

const board = (fleet: FleetModel) =>
  renderToStaticMarkup(React.createElement(FleetBoard, {
    fleet,
    providerLabel: () => 'Antigravity',
    refreshingId: null,
    onSelectAgent: () => {},
    onSetRole: () => {},
    onSpeedChange: () => {},
    onRefresh: () => {},
    onConsumeResetCredit: () => {}
  }))

const withPools = (pools: ReturnType<typeof pool>[], strays: FleetAgentRow[] = []): FleetModel => ({
  accounts: [{ key: 'antigravity/acc1', account, state: 'ready', pools, strays }],
  unassigned: []
})

describe('FleetBoard', () => {
  it('nests agents under the pool they draw on', () => {
    // Two models, one pool. The markup must place both inside it, because a
    // flat list is what made them read as alternatives.
    const markup = board(withPools([
      pool('claude-gpt', [row(), row({ id: 'a2', name: 'anti-claude-sonnet' })])
    ]))
    const poolIndex = markup.indexOf('claude-gpt')
    expect(poolIndex).toBeGreaterThan(-1)
    expect(markup.indexOf('anti-claude-opus')).toBeGreaterThan(poolIndex)
    expect(markup.indexOf('anti-claude-sonnet')).toBeGreaterThan(poolIndex)
  })

  it('keeps a provider sentence out of the row and in the tooltip', () => {
    // The label is a label. The provider's paragraph made one window three
    // lines tall for a fact the percentage beside it already stated.
    const prose = 'You have used some of your weekly limit, it will fully refresh in 3 days.'
    const markup = board(withPools([pool('gemini', [], [window({ description: prose })])]))
    expect(markup).toContain(`title="${prose}`)
    expect(markup).toContain('>Weekly<')
  })

  it('states the countdown on the row and the timestamp only on hover', () => {
    const markup = board(withPools([pool('gemini', [], [window()])]))
    expect(markup).toContain('>93%<')
    expect(markup).not.toContain('Next reset · ')
  })

  it('keeps the refresh control', () => {
    // Moving a panel must not drop a function. This one was gated to the chat
    // variant and disappeared with the pinned block.
    expect(board(withPools([pool('gemini', [])]))).toContain('Refresh quota for')
  })

  it('says nothing about a pool with no agent drawing on it', () => {
    // It repeated under every idle pool and said nothing the empty space did
    // not already say.
    expect(board(withPools([pool('gemini', [])]))).not.toContain('No agent drawing on this pool')
  })

  it('turns a lit control off rather than leaving it stuck on', () => {
    // Pressing the coordinator control used to be a one-way door: it disabled
    // itself and hid the worker control behind it, so nothing on the row could
    // undo the press.
    const markup = board(withPools([pool('codex', [row({ role: 'coordinator', mode: 'coordinate' })])]))
    expect(markup).toContain('click to release')
    expect(markup).not.toContain('disabled=""')
  })

  it('offers both controls in every state', () => {
    for (const role of ['coordinator', 'worker', 'none'] as const) {
      const markup = board(withPools([pool('codex', [row({ role })])]))
      expect(markup).toContain('Coordinator:')
      expect(markup).toContain('Can be assigned work:')
    }
  })

  it('lights exactly one control, or neither', () => {
    const lit = (role: FleetAgentRow['role']) =>
      (board(withPools([pool('codex', [row({ role })])])).match(/aria-pressed="true"/g) ?? []).length
    expect(lit('coordinator')).toBe(1)
    expect(lit('worker')).toBe(1)
    expect(lit('none')).toBe(0)
  })

  it('names who would lose the role on the control that would take it', () => {
    // Exclusive, so taking it demotes someone. Saying whose keeps that from
    // happening silently — the tooltip carries it now the label is an icon.
    const markup = board(withPools([pool('codex', [
      row({ role: 'coordinator', mode: 'coordinate' }),
      row({ id: 'a2', name: 'anti-claude-sonnet' })
    ])]))
    expect(markup).toContain('takes the role from anti-claude-opus')
  })

  it('shows an excluded agent as excluded', () => {
    const markup = board(withPools([pool('codex', [row({ role: 'none' })])]))
    expect(markup).toContain('Excluded from assignment')
  })

  it('shows an agent whose model no pool claims', () => {
    expect(board(withPools([], [row({ id: 'a3', name: 'odd' })]))).toContain('odd')
  })

  it('shows an agent that has no account yet', () => {
    const markup = board({ accounts: [], unassigned: [row({ id: 'a9', name: 'newcomer' })] })
    expect(markup).toContain('newcomer')
    expect(markup).toContain('Unassigned')
  })

  it('invites action when the project has no agents', () => {
    // An empty screen is an invitation to act, not a dead end.
    expect(board({ accounts: [], unassigned: [] })).toContain('No agents in this project')
  })
})
