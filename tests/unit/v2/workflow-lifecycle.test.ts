import { describe, expect, it } from 'vitest'
import { createWorkflowLifecycleService } from '../../../src/main/v2/application/workflow/lifecycle-service'

describe('workflow lifecycle controls', () => {
  it('pauses/resumes the same run and preserves completed outputs', async () => {
    let state = { id: 'run', status: 'EXECUTING' as const, blockingGates: 0,
      completedOutputIds: ['artifact'] }
    const cancellations: string[] = []
    const service = createWorkflowLifecycleService({ load: async () => state,
      save: async next => { state = next as typeof state },
      cancelActiveAgentRuns: async reason => { cancellations.push(reason) },
      transaction: async operation => operation() })
    const paused = await service.pause('run')
    expect(paused).toMatchObject({ id: 'run', status: 'PAUSED', completedOutputIds: ['artifact'] })
    expect(cancellations).toEqual(['pause'])
    expect(await service.resume('run')).toMatchObject({ id: 'run', status: 'EXECUTING' })
  })

  it('cancels terminally while preserving history and blocks completed mutation', async () => {
    let state: any = { id: 'run', status: 'EXECUTING', blockingGates: 0,
      completedOutputIds: ['artifact'] }
    const service = createWorkflowLifecycleService({ load: async () => state,
      save: async next => { state = next }, cancelActiveAgentRuns: async () => {},
      transaction: async operation => operation() })
    expect(await service.cancel('run')).toMatchObject({ status: 'CANCELLED',
      completedOutputIds: ['artifact'] })
    state = { ...state, status: 'COMPLETED' }
    await expect(service.cancel('run')).rejects.toThrow(/terminal/i)
  })

  it('marks an interrupted active run recoverably blocked', async () => {
    let state: any = { id: 'run', status: 'EXECUTING', blockingGates: 0 }
    const service = createWorkflowLifecycleService({ load: async () => state,
      save: async next => { state = next }, cancelActiveAgentRuns: async () => {},
      transaction: async operation => operation() })
    expect(await service.recoverInterrupted('run')).toMatchObject({ status: 'BLOCKED' })
  })

  it('runs lifecycle state and AgentRun cancellation atomically', async () => {
    let transactions = 0
    const service = createWorkflowLifecycleService({
      load: async () => ({ id: 'run', status: 'EXECUTING', blockingGates: 0 }),
      save: async () => {}, cancelActiveAgentRuns: async () => {},
      transaction: async operation => { transactions += 1; return operation() }
    })
    await service.pause('run')
    expect(transactions).toBe(1)
  })
})
