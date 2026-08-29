import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ToolExecutor } from '../../../src/main/v2/runtime/tools/tool-executor'
import { V1ToolRegistryAdapter } from '../../../src/main/v2/infrastructure/tools/v1-tool-registry-adapter'

describe('ToolExecutor', () => {
  it('executes concurrent duplicate callId at most once', async () => {
    let sideEffects = 0
    const events: string[] = []
    const executor = new ToolExecutor({ record: async event => { events.push(event.type) } })
    const call = { callId: 'c1' }
    const run = async () => { sideEffects += 1; await Promise.resolve(); return 'ok' }
    const [first, second] = await Promise.all([executor.execute(call, run), executor.execute(call, run)])
    expect([first, second]).toEqual(['ok', 'ok'])
    expect(sideEffects).toBe(1)
    expect(events).toEqual(['TOOL_STARTED', 'TOOL_COMPLETED'])
  })

  it('returns the same structured error without rerunning a failed call', async () => {
    let attempts = 0
    const executor = new ToolExecutor({ record: async () => {} })
    const run = async () => { attempts += 1; throw new Error('boom') }
    await expect(executor.execute({ callId: 'failed' }, run)).rejects.toThrow('boom')
    await expect(executor.execute({ callId: 'failed' }, run)).rejects.toThrow('boom')
    expect(attempts).toBe(1)
  })

  it('uses durable reservation to prevent replay after restart', async () => {
    const completed = new Map<string, unknown>()
    const idempotency = {
      reserve: async (id: string) => completed.has(id) ? { status: 'COMPLETED' as const,
        result: completed.get(id) } : { status: 'RESERVED' as const },
      complete: async (id: string, result: unknown) => { completed.set(id, result) },
      fail: async () => {}
    }
    let effects = 0
    const first = new ToolExecutor({ record: async () => {} }, idempotency)
    expect(await first.execute({ callId: 'durable' }, async () => ++effects)).toBe(1)
    const restarted = new ToolExecutor({ record: async () => {} }, idempotency)
    expect(await restarted.execute({ callId: 'durable' }, async () => ++effects)).toBe(1)
    expect(effects).toBe(1)
  })
})

describe('V1 tool registry adapter', () => {
  it('normalizes legacy tools with explicit V2 safety metadata', () => {
    const adapter = new V1ToolRegistryAdapter([{ name: 'read', description: 'Read',
      schema: z.object({ path: z.string() }), execute: async () => 'ok' }])
    const tool = adapter.tools().get('read')!
    expect(tool.definition).toMatchObject({
      permissionCategory: 'filesystem.read', sideEffectLevel: 'NONE', outputPolicy: 'INLINE'
    })
  })
})
