import type { ProviderAccountSnapshot, ProviderSnapshot } from '@shared/provider-state'
import type { AgentConfig, AgentMode, AgentSpeed, ProviderQuotaGroup } from '@shared/types'
import { quotaAccountState, type QuotaAccountUiState } from '../quota/quota-view'

export interface FleetAgentRow {
  id: string
  name: string
  mode: AgentMode
  modelId?: string
  modelLabel?: string
  // Carried so the speed control survives the move out of the pinned quota
  // block. Removing the block must not remove a function with it.
  speed?: AgentSpeed
  coordinator: boolean
}

export interface FleetPool {
  group: ProviderQuotaGroup
  agents: FleetAgentRow[]
}

export interface FleetAccount {
  key: string
  account: ProviderAccountSnapshot
  state: QuotaAccountUiState
  pools: FleetPool[]
  // Configured for this account, but running a model no reported pool claims.
  // Shown rather than dropped: an agent missing from the roster is the fault
  // this surface exists to fix.
  strays: FleetAgentRow[]
}

export interface FleetModel {
  accounts: FleetAccount[]
  unassigned: FleetAgentRow[]
}

function row(agent: AgentConfig, modelId?: string, modelLabel?: string, speed?: AgentSpeed): FleetAgentRow {
  return {
    id: agent.id,
    name: agent.name,
    mode: agent.mode ?? 'build',
    coordinator: agent.mode === 'coordinate',
    ...(modelId === undefined ? {} : { modelId }),
    ...(modelLabel === undefined ? {} : { modelLabel }),
    ...(speed === undefined ? {} : { speed })
  }
}

// Grouped by the pool an agent draws on, not by the agent. Two models sharing
// one pool read as alternatives in a flat list — pick the other when the first
// is spent — when in truth exhausting one exhausts both.
export function buildFleet(agents: AgentConfig[], snapshot: ProviderSnapshot | null): FleetModel {
  const native = agents.filter(agent => agent.kind !== 'pty')
  if (!snapshot) return { accounts: [], unassigned: native.map(agent => row(agent)) }

  const accounts = new Map<string, FleetAccount>()
  const unassigned: FleetAgentRow[] = []

  for (const agent of native) {
    const stored = snapshot.assignments.find(item => item.agentId === agent.id && item.status === 'ready')
    const account = stored?.accountId
      ? snapshot.accounts.find(item => item.id === stored.accountId && item.providerId === stored.providerId)
      : undefined
    if (!stored || !account) {
      unassigned.push(row(agent, stored?.modelId))
      continue
    }
    const key = `${stored.providerId}/${account.id}`
    const section = accounts.get(key) ?? {
      key,
      account,
      state: quotaAccountState(account),
      pools: (account.usage?.quotaGroups ?? []).map(group => ({ group, agents: [] })),
      strays: []
    }
    const entry = row(agent, stored.modelId, account.models.find(model => model.id === stored.modelId)?.name, stored.speed)
    const pool = section.pools.find(item => item.group.modelIds.includes(stored.modelId))
    if (pool) pool.agents.push(entry)
    else section.strays.push(entry)
    accounts.set(key, section)
  }

  return { accounts: [...accounts.values()], unassigned }
}
