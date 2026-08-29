import { describe, expect, it } from 'vitest'
import { createAgentRunService } from '../../../src/main/v2/application/agent/agent-run-service'
import { AgentRunner } from '../../../src/main/v2/runtime/agent/agent-runner'
import { SteeringQueue } from '../../../src/main/v2/runtime/agent/steering-queue'

describe('AgentRunner', () => {
  it('succeeds after a finished step with no tool calls', async () => {
    const runner = new AgentRunner()
    const result = await runner.run({ maxSteps: 3, nextStep: async () => [
      { kind: 'text-delta', text: 'done' }, { kind: 'finish', reason: 'stop' }
    ], executeTool: async () => ({ status: 'success' }) })
    expect(result).toEqual({ status: 'SUCCEEDED', steps: 1 })
    expect(result).not.toHaveProperty('workflowStatus')
  })

  it('executes structured calls at step boundaries then continues', async () => {
    const calls: string[] = []
    const runner = new AgentRunner()
    const result = await runner.run({ maxSteps: 3,
      nextStep: async step => step === 0 ? [{ kind: 'tool-call', call: {
        callId: 'c1', toolName: 'read', arguments: {}, origin: 'model',
        requestedAt: '2026-08-29T00:00:00.000Z' } }] : [{ kind: 'finish', reason: 'stop' }],
      executeTool: async call => { calls.push(call.callId); return { status: 'success' } }
    })
    expect(result.status).toBe('SUCCEEDED')
    expect(calls).toEqual(['c1'])
  })

  it('returns CANCELLED on abort and DEGRADED on step limit', async () => {
    const controller = new AbortController(); controller.abort()
    const runner = new AgentRunner()
    expect((await runner.run({ maxSteps: 1, signal: controller.signal,
      nextStep: async () => [], executeTool: async () => ({}) })).status).toBe('CANCELLED')
    const limited = await runner.run({ maxSteps: 1, nextStep: async () => [{ kind: 'tool-call', call: {
      callId: 'c', toolName: 'read', arguments: {}, origin: 'model',
      requestedAt: '2026-08-29T00:00:00.000Z' } }], executeTool: async () => ({}) })
    expect(limited).toMatchObject({
      status: 'DEGRADED', code: 'STEP_LIMIT'
    })
  })

  it('drains steering only at model step boundaries', async () => {
    const steering = new SteeringQueue<string>()
    steering.push('before')
    const seen: string[][] = []
    const runner = new AgentRunner()
    await runner.run({ maxSteps: 2, steering,
      nextStep: async (step, _results, _signal, messages) => {
        seen.push([...(messages ?? [])])
        return step === 0 ? [{ kind: 'tool-call', call: { callId: 'c', toolName: 'read',
          arguments: {}, origin: 'model', requestedAt: '2026-08-29T00:00:00.000Z' } }]
          : [{ kind: 'finish', reason: 'stop' }]
      },
      executeTool: async () => { steering.push('during'); return {} }
    })
    expect(seen).toEqual([['before'], ['during']])
  })
})

describe('AgentRunService', () => {
  it('persists running and terminal AgentRun status only', async () => {
    const statuses: string[] = []
    const service = createAgentRunService({ saveStatus: async (_id, status) => { statuses.push(status) },
      runner: new AgentRunner() })
    await service.runAssignment({ agentRunId: 'a', maxSteps: 1,
      nextStep: async () => [{ kind: 'finish', reason: 'stop' }], executeTool: async () => ({}) })
    expect(statuses).toEqual(['RUNNING', 'SUCCEEDED'])
  })
})
