import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FleetBoard } from '../../src/renderer/src/components/fleet/FleetPanel'
import type { FleetAgentRow, FleetModel } from '../../src/renderer/src/components/fleet/fleet-model'
import type { ProviderAccountSnapshot } from '../../src/shared/provider-state'

const account: ProviderAccountSnapshot = {
  id: 'acc1', providerId: 'antigravity', label: 'bdg', authMode: 'oauth',
  status: 'active', updatedAt: 0, models: []
}

const row = (patch: Partial<FleetAgentRow> = {}): FleetAgentRow =>
  ({ id: 'a1', name: 'anti-claude-opus', mode: 'build', coordinator: false, ...patch })

const pool = (id: string, agents: FleetAgentRow[]) => ({
  group: { id, label: id, modelIds: [], windows: [] },
  agents
})

const board = (fleet: FleetModel) =>
  renderToStaticMarkup(React.createElement(FleetBoard, {
    fleet,
    providerLabel: () => 'Antigravity',
    refreshingId: null,
    onSelectAgent: () => {},
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

  it('says when a pool has no agent drawing on it', () => {
    expect(board(withPools([pool('gemini', [])]))).toContain('No agent drawing on this pool')
  })

  it('marks the coordinator', () => {
    expect(board(withPools([pool('codex', [row({ coordinator: true, mode: 'coordinate' })])]))).toContain('coordinates')
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
