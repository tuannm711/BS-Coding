import { describe, expect, it } from 'vitest'
import { createAssignmentService } from '../../../src/main/v2/application/agent/assignment-service'

describe('assignment and dispatch', () => {
  it('persists an auditable assignment before dispatch with self-contained envelope', async () => {
    const order: string[] = []
    const saved: unknown[] = []
    const dispatched: unknown[] = []
    const service = createAssignmentService({
      nextId: () => 'assignment-1', now: () => '2026-08-29T00:00:00.000Z',
      loadAgentVersion: async id => Object.freeze({ id, revision: 3 }),
      save: async assignment => { order.push('save'); saved.push(assignment) },
      dispatch: async input => { order.push('dispatch'); dispatched.push(input) }
    })
    const envelope = { objective: 'Implement OAuth', scope: ['src/auth'],
      acceptanceCriteria: ['tests pass'], dependencies: ['task-a'], artifactIds: ['artifact'],
      workspace: { path: 'C:/worktree', mode: 'ISOLATED_WRITE' as const },
      reportingContract: 'Return summary and commit' }
    const assignment = await service.assignAndDispatch({ taskRunId: 'tr1',
      agentVersionId: 'av1', envelope })
    expect(order).toEqual(['save', 'dispatch'])
    expect(saved).toEqual([assignment])
    expect(dispatched[0]).toMatchObject({ assignment, agentVersion: { id: 'av1', revision: 3 }, envelope })
  })

  it('does not dispatch if assignment persistence fails', async () => {
    let dispatched = false
    const service = createAssignmentService({ nextId: () => 'a', now: () => 'now',
      loadAgentVersion: async () => Object.freeze({ id: 'av', revision: 1 }),
      save: async () => { throw new Error('db down') },
      dispatch: async () => { dispatched = true } })
    await expect(service.assignAndDispatch({ taskRunId: 'tr', agentVersionId: 'av', envelope: {
      objective: 'x', scope: [], acceptanceCriteria: [], dependencies: [], artifactIds: [],
      workspace: { path: 'p', mode: 'READ_ONLY' }, reportingContract: 'report' } })).rejects.toThrow('db down')
    expect(dispatched).toBe(false)
  })
})
