import { describe, expect, it } from 'vitest'
import { createRuntimeEpochService, type EpochRecord } from '../../../src/main/v2/application/runtime/runtime-epoch-service'

describe('RuntimeEpochService', () => {
  it('closes the active epoch before starting a new target in the same AgentRun', async () => {
    const epochs = new Map<string, EpochRecord>([['e1', { id: 'e1', workSessionId: 'w', agentRunId: 'a',
      status: 'ACTIVE' as const, target: { providerId: 'claude', accountId: 'old', modelId: 'm' } }]])
    const events: string[] = []
    let id = 1
    const service = createRuntimeEpochService({
      findActive: async () => epochs.get('e1') ?? null,
      save: async epoch => { epochs.set(epoch.id, epoch) },
      appendLifecycle: async event => { events.push(event.type) },
      nextId: () => `e${++id}`,
      now: () => '2026-08-29T00:00:00.000Z'
    })
    const next = await service.switchRuntime({ workSessionId: 'w', agentRunId: 'a',
      target: { providerId: 'openai', accountId: 'new', modelId: 'codex' }, reason: 'user-switch' })
    expect(epochs.get('e1')).toMatchObject({ status: 'CLOSED', endReason: 'user-switch' })
    expect(next).toMatchObject({ epochId: 'e2', workSessionId: 'w', agentRunId: 'a' })
    expect(events).toEqual(['RUNTIME_EPOCH_CLOSED', 'RUNTIME_EPOCH_STARTED'])
  })

  it('requires an active epoch when switching', async () => {
    const service = createRuntimeEpochService({ findActive: async () => null, save: async () => {},
      appendLifecycle: async () => {}, nextId: () => 'e2', now: () => '2026-08-29T00:00:00.000Z' })
    await expect(service.switchRuntime({ workSessionId: 'w', agentRunId: 'a', target: {
      providerId: 'p', accountId: 'a', modelId: 'm' }, reason: 'fallback' })).rejects.toThrow(/active/i)
  })
})
