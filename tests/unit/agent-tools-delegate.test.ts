import { describe, expect, it, vi } from 'vitest'
import { createDelegateTool } from '../../src/main/agent/tools/delegate'
import type { ToolContext } from '../../src/main/agent/tools/types'

const ctx = { cwd: '/proj', ask: async () => null } as unknown as ToolContext
const workers = [
  { name: 'anti-gemini-flash', coordinating: false },
  { name: 'boss', coordinating: true }
]

describe('delegate', () => {
  it('returns the worker result', async () => {
    const run = vi.fn(async () => ({ output: 'done: 3 files changed' }))
    const tool = createDelegateTool({ listWorkers: () => workers, run })
    const result = await tool.run({ agent: 'anti-gemini-flash', task: 'update the readme' }, ctx)
    expect(run).toHaveBeenCalledWith('anti-gemini-flash', 'update the readme')
    expect(result.output).toContain('3 files changed')
  })

  it('names the agents that exist when given one that does not', async () => {
    const tool = createDelegateTool({ listWorkers: () => workers, run: async () => ({ output: '' }) })
    const result = await tool.run({ agent: 'nobody', task: 'x' }, ctx)
    expect(result.error).toContain('anti-gemini-flash')
  })

  it('refuses a target that is itself coordinating', async () => {
    // One level deep. Two coordinators delegating to each other would loop.
    const run = vi.fn(async () => ({ output: '' }))
    const tool = createDelegateTool({ listWorkers: () => workers, run })
    expect((await tool.run({ agent: 'boss', task: 'x' }, ctx)).error).toBeTruthy()
    expect(run).not.toHaveBeenCalled()
  })

  it('reports a worker failure as a tool error, not a throw', async () => {
    // A worker that fails is something the coordinator should act on, not a
    // crash of the coordinating turn.
    const tool = createDelegateTool({
      listWorkers: () => workers,
      run: async () => ({ error: 'quota exhausted everywhere' })
    })
    const result = await tool.run({ agent: 'anti-gemini-flash', task: 'x' }, ctx)
    expect(result.error).toContain('quota exhausted')
  })

  it('rejects an empty task rather than sending one', async () => {
    const run = vi.fn(async () => ({ output: '' }))
    const tool = createDelegateTool({ listWorkers: () => workers, run })
    expect((await tool.run({ agent: 'anti-gemini-flash', task: '  ' }, ctx)).error).toBeTruthy()
    expect(run).not.toHaveBeenCalled()
  })
})
