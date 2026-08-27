import { describe, expect, it } from 'vitest'
import { buildFleet } from '../../src/renderer/src/components/fleet/fleet-model'
import type { ProviderSnapshot } from '../../src/shared/provider-state'
import type { AgentConfig } from '../../src/shared/types'

const agent = (patch: Partial<AgentConfig> = {}): AgentConfig =>
  ({ id: 'a1', name: 'anti-claude-opus', templateId: 'bs', cwd: '/proj', kind: 'native', ...patch })

const assignment = (agentId: string, modelId: string) => ({
  agentId, providerId: 'antigravity', accountId: 'acc1', modelId,
  speed: 'standard' as const, revision: 1, status: 'ready' as const
})

const snapshot = (assignments = [
  assignment('a1', 'claude-opus-4-6-thinking'),
  assignment('a2', 'claude-sonnet-4-6')
]): ProviderSnapshot => ({
  revision: 1,
  updatedAt: 0,
  providers: [],
  assignments,
  accounts: [{
    id: 'acc1',
    providerId: 'antigravity',
    label: 'bdg',
    authMode: 'oauth',
    status: 'active',
    updatedAt: 0,
    models: [],
    usage: {
      accountId: 'acc1',
      refreshedAt: 0,
      source: 'provider',
      status: 'ok',
      quotaGroups: [
        { id: 'gemini', label: 'gemini', modelIds: ['gemini-3.6-flash-high'], windows: [{ id: 'w1', label: 'weekly', kind: 'unknown', remainingPercent: 93, usageKnown: true, source: 'provider' }] },
        { id: 'claude-gpt', label: 'claude-gpt', modelIds: ['claude-opus-4-6-thinking', 'claude-sonnet-4-6'], windows: [{ id: 'w2', label: 'weekly', kind: 'unknown', remainingPercent: 40, usageKnown: true, source: 'provider' }] }
      ]
    }
  }]
})

describe('buildFleet', () => {
  it('puts two models that share a pool under one pool', () => {
    // The reason this surface exists: in a flat list these read as
    // alternatives, when exhausting one exhausts both.
    const fleet = buildFleet([agent(), agent({ id: 'a2', name: 'anti-claude-sonnet' })], snapshot())
    const occupied = fleet.accounts[0].pools.filter(pool => pool.agents.length > 0)
    expect(occupied).toHaveLength(1)
    expect(occupied[0].group.id).toBe('claude-gpt')
    expect(occupied[0].agents.map(row => row.name)).toEqual(['anti-claude-opus', 'anti-claude-sonnet'])
  })

  it('keeps an empty pool visible', () => {
    // A pool nobody draws on is still quota this account holds.
    const fleet = buildFleet([agent()], snapshot([assignment('a1', 'claude-opus-4-6-thinking')]))
    expect(fleet.accounts[0].pools.map(pool => pool.group.id)).toEqual(['gemini', 'claude-gpt'])
  })

  it('still lists an agent with no ready assignment', () => {
    // A roster that hides an agent is not a roster.
    const fleet = buildFleet([agent({ id: 'a9', name: 'newcomer' })], snapshot())
    expect(fleet.unassigned.map(row => row.name)).toEqual(['newcomer'])
  })

  it('reads an agent excluded from assignment as having no role', () => {
    // Three states from two stored fields: absent `worker` means yes, so an
    // agent stored before the field existed is still a worker.
    const fleet = buildFleet([agent({ worker: false })], snapshot())
    expect(fleet.accounts[0].pools.flatMap(pool => pool.agents)[0].role).toBe('none')
  })

  it('marks the coordinator and nobody else', () => {
    const fleet = buildFleet([
      agent({ mode: 'coordinate' }), agent({ id: 'a2', name: 'anti-claude-sonnet' })
    ], snapshot())
    const rows = fleet.accounts.flatMap(account => account.pools.flatMap(pool => pool.agents))
    expect(rows.filter(row => row.role === 'coordinator').map(row => row.name)).toEqual(['anti-claude-opus'])
  })

  it('returns everything as unassigned with no snapshot', () => {
    const fleet = buildFleet([agent()], null)
    expect(fleet.accounts).toHaveLength(0)
    expect(fleet.unassigned).toHaveLength(1)
  })

  it('keeps an agent whose model matches no pool under its account', () => {
    const fleet = buildFleet([agent({ id: 'a3', name: 'odd' })], snapshot([assignment('a3', 'unknown-model')]))
    expect(fleet.accounts[0].strays.map(row => row.name)).toEqual(['odd'])
    expect(fleet.unassigned).toHaveLength(0)
  })

  it('orders accounts by provider then account name', () => {
    // A roster is scanned for a name; insertion order is whatever order the
    // agents happened to be declared in.
    const many = {
      ...snapshot(),
      accounts: [
        { ...snapshot().accounts[0], id: 'z', providerId: 'openai', label: 'zed' },
        { ...snapshot().accounts[0], id: 'b', providerId: 'antigravity', label: 'bravo' },
        { ...snapshot().accounts[0], id: 'a', providerId: 'antigravity', label: 'alpha' }
      ],
      assignments: [
        assignment('a1', 'claude-opus-4-6-thinking'),
        { ...assignment('a2', 'claude-sonnet-4-6'), accountId: 'b' },
        { ...assignment('a3', 'claude-sonnet-4-6'), accountId: 'z', providerId: 'openai' }
      ].map(item => item.agentId === 'a1' ? { ...item, accountId: 'a' } : item)
    } as ProviderSnapshot
    const fleet = buildFleet([
      agent({ id: 'a3', name: 'c' }), agent({ id: 'a2', name: 'b' }), agent({ id: 'a1', name: 'a' })
    ], many)
    expect(fleet.accounts.map(section => section.account.label)).toEqual(['alpha', 'bravo', 'zed'])
  })

  it('places agents by family when the provider sent no model list', () => {
    // Cloud Code's quota summary carries no modelIds on its buckets, so every
    // group arrives with modelIds: []. Matching on that alone put every agent
    // in strays — the pool grouping, which is the whole point of the panel,
    // was dead in the app while this suite stayed green on a fixture that
    // happened to spell the ids out.
    const empty = {
      ...snapshot(),
      accounts: [{
        ...snapshot().accounts[0],
        usage: {
          ...snapshot().accounts[0].usage!,
          quotaGroups: [
            { id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [] },
            { id: 'claude-gpt', label: 'Claude and GPT models', modelIds: [], windows: [] }
          ]
        }
      }]
    } as ProviderSnapshot
    const fleet = buildFleet([agent(), agent({ id: 'a2', name: 'anti-gemini-flash' })], {
      ...empty,
      assignments: [assignment('a1', 'claude-opus-4-6-thinking'), assignment('a2', 'gemini-3.6-flash-high')]
    } as ProviderSnapshot)
    const byPool = Object.fromEntries(fleet.accounts[0].pools.map(pool => [pool.group.id, pool.agents.map(row => row.name)]))
    expect(byPool['claude-gpt']).toEqual(['anti-claude-opus'])
    expect(byPool['gemini']).toEqual(['anti-gemini-flash'])
    expect(fleet.accounts[0].strays).toEqual([])
  })

  it('ignores pty agents', () => {
    // They have no model and no quota; a roster of who can be assigned work
    // is a roster of native agents.
    const fleet = buildFleet([agent({ id: 'p1', name: 'opencode', kind: 'pty' })], snapshot())
    expect(fleet.unassigned).toHaveLength(0)
  })
})
