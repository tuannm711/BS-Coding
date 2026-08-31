import { expect, it } from 'vitest'
import { P15_PUBLIC_API_KEYS, P15PublicIpcSchemas } from '../../../src/shared/v2/schemas/p15-backend-ipc'
import { P15_IPC } from '../../../src/shared/v2/contracts/p15-backend-ipc'
import { createP15BackendApi } from '../../../src/preload/p15-backend-api'

it('has one registry channel and schema for every P15 backend public method', () => {
  expect(Object.keys(P15PublicIpcSchemas).sort()).toEqual([...P15_PUBLIC_API_KEYS].sort())
  expect(Object.keys(P15_IPC).sort()).toEqual([...P15_PUBLIC_API_KEYS].sort())
  expect(Object.values(P15_IPC).every(channel => channel.startsWith('bs.v2.'))).toBe(true)
  expect(P15PublicIpcSchemas['agent.remove'].request.safeParse({
    requestId: 'r', input: { scopeId: 'p1' }
  }).success).toBe(false)
  expect(P15PublicIpcSchemas['diagnostics.list'].response.safeParse([{ rawSecret: 'x' }]).success)
    .toBe(false)
  expect(P15PublicIpcSchemas['git.status'].response.safeParse({
    project: { id: 'p1' }, revision: 1
  }).success).toBe(false)
  expect(P15PublicIpcSchemas['workSession.runtimeTargets'].response.safeParse([{
    id: 'openai/account/model', providerName: 'OpenAI', accountLabel: 'Work', modelName: 'Model',
    accountStatus: 'HEALTHY', selectable: true,
    target: { providerId: 'openai', accountId: 'account', modelId: 'model',
      capabilities: { structuredTools: 'UNKNOWN' } }, rawSecret: 'forbidden'
  }]).success).toBe(false)
  expect(P15_PUBLIC_API_KEYS).toEqual(expect.arrayContaining([
    'update.status', 'update.setChannel', 'update.check', 'update.download', 'update.apply',
    'remote.status', 'remote.setRelayUrl', 'remote.setEnabled', 'remote.startPairing',
    'remote.revokeDevice'
  ]))
  const remote = P15PublicIpcSchemas['remote.status'].response.parse({
    enabled: true, state: 'CONNECTED', devices: [], token: 'secret'
  })
  expect(remote).toEqual({ enabled: true, state: 'CONNECTED', devices: [] })
})

it('exposes every invoke contract as a validated named preload method', async () => {
  const calls: Array<{ channel: string; payload: unknown }> = []
  const api = createP15BackendApi({ invoke: async (channel, payload) => {
    calls.push({ channel, payload })
    if (channel === P15_IPC['project.get']) return { id: 'p1', name: 'PMS', repoPath: 'C:/PMS',
      defaultBranch: 'master', activeWorkCount: 0, updatedAt: '2026-08-30T00:00:00.000Z', revision: 1 }
    return { ok: true }
  }, nextRequestId: () => 'request-1' })
  expect(Object.keys(api).sort()).toEqual(P15_PUBLIC_API_KEYS.filter(key => key !== 'workflow.projection').sort())
  await expect(api['project.get']({ id: 'p1' })).resolves.toMatchObject({ name: 'PMS' })
  await api['agent.remove']({ scopeId: 'p1', agentId: 'a1' })
  expect(calls[1]).toEqual({ channel: P15_IPC['agent.remove'], payload: {
    requestId: 'request-1', input: { scopeId: 'p1', agentId: 'a1' }
  } })
})
