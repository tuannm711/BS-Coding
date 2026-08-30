import { expect, it } from 'vitest'
import { createAgentSettingsProjectionService } from '../../../src/main/v2/application/projections/agent-settings-projections'
import { createAgentSettingsCommands } from '../../../src/main/v2/application/commands/agent-settings-commands'
import type { CommandIdempotencyPort } from '../../../src/main/v2/application/ports/command-idempotency-port'
import { vi } from 'vitest'

it('never emits vault values or project Agents under global settings', async () => {
  const service = createAgentSettingsProjectionService({
    revision: async () => 3,
    listAgents: async () => [{ id: 'a', name: 'Reviewer', role: 'Reviewer', status: 'READY' }],
    listProviderAccounts: async () => [],
    credentialState: async () => ({ openai: { configured: true } })
  })
  const projection = await service.get('p1')
  expect(projection.agents).toHaveLength(1)
  expect(projection.globalSettings).not.toHaveProperty('agents')
  expect(JSON.stringify(projection)).not.toContain('secret-value')
})

it('does not echo provider secrets and replays the same request', async () => {
  const state = new Map<string, unknown>()
  const idempotency: CommandIdempotencyPort = {
    async reserve(id, name) { const key = `${id}:${name}`; return state.has(key)
      ? { status: 'COMPLETED', result: state.get(key) } : { status: 'RESERVED' } },
    async complete(id, name, result) { state.set(`${id}:${name}`, result) },
    async release() {}
  }
  const connectProvider = vi.fn(async (input: { [key: string]: unknown }) => ({ providerId: 'openai',
    configured: Boolean(input.apiKey) }))
  const commands = createAgentSettingsCommands({ idempotency, transaction: async fn => fn(),
    createAgent: vi.fn(), updateAgent: vi.fn(), removeAgent: vi.fn(), connectProvider,
    refreshProvider: vi.fn(), setProviderEnabled: vi.fn(), probeProvider: vi.fn(),
    updateSettings: vi.fn() })
  const input = { requestId: 'r1', scopeId: 'global', providerId: 'openai', apiKey: 'secret-value' }
  const first = await commands.connectProvider(input)
  const replay = await commands.connectProvider(input)
  expect(replay).toEqual(first)
  expect(JSON.stringify(first)).not.toContain('secret-value')
  expect(connectProvider).toHaveBeenCalledOnce()
})
