import { expect, it, vi } from 'vitest'
import { createWorkSessionCommands } from '../../../src/main/v2/application/commands/work-session-commands'
import type { CommandIdempotencyPort } from '../../../src/main/v2/application/ports/command-idempotency-port'

function port(): CommandIdempotencyPort {
  const done = new Map<string, unknown>(); const active = new Set<string>()
  return {
    async reserve(id, name) { const key = `${id}:${name}`; if (done.has(key)) return { status: 'COMPLETED', result: done.get(key) }; if (active.has(key)) return { status: 'IN_PROGRESS' }; active.add(key); return { status: 'RESERVED' } },
    async complete(id, name, result) { const key = `${id}:${name}`; active.delete(key); done.set(key, result) },
    async release(id, name) { active.delete(`${id}:${name}`) }
  }
}

it('replays pause by request id without invoking lifecycle twice', async () => {
  const pause = vi.fn(async () => ({ id: 'wf1', status: 'PAUSED' as const, blockingGates: 0 }))
  const commands = createWorkSessionCommands({ idempotency: port(), transaction: async fn => fn(),
    resolve: async () => ({ workSessionId: 'ws1', workflowRunId: 'wf1' }),
    lifecycle: { pause, resume: vi.fn(), cancel: vi.fn() }, switchRuntime: vi.fn(),
    approvePlan: vi.fn(), createRework: vi.fn() })
  const input = { requestId: 'r1', projectId: 'p1', workSessionId: 'ws1' }
  await commands.pause(input); await commands.pause(input)
  expect(pause).toHaveBeenCalledOnce()
})

it('rejects foreign ownership before reserving or executing a command', async () => {
  const pause = vi.fn()
  const commands = createWorkSessionCommands({ idempotency: port(), transaction: async fn => fn(),
    resolve: async () => null, lifecycle: { pause, resume: vi.fn(), cancel: vi.fn() },
    switchRuntime: vi.fn(), approvePlan: vi.fn(), createRework: vi.fn() })
  await expect(commands.pause({ requestId: 'r', projectId: 'foreign', workSessionId: 'ws1' }))
    .rejects.toMatchObject({ code: 'PROJECTION_NOT_FOUND' })
  expect(pause).not.toHaveBeenCalled()
})
