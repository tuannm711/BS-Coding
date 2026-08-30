import { expect, it } from 'vitest'
import { createWorkProjectionService, projectedTaskStatus } from '../../../src/main/v2/application/projections/work-projections'
import type { ProjectionReadPort } from '../../../src/main/v2/application/ports/projection-read-port'
import type { StoredEvent } from '../../../src/main/v2/application/ports/event-store'

const now = '2026-08-30T00:00:00.000Z'
const baseEvent = { schemaVersion: 1 as const, timestamp: now, projectId: 'p1',
  workSessionId: 'ws1', workflowRunId: 'wf1', correlationId: 'c' }
const events: StoredEvent[] = [
  { ...baseEvent, aggregateId: 'wf1', sequence: 1, id: 'e1', type: 'ASSISTANT_MESSAGE',
    payload: { text: 'Calling read({"path":"secret"})' } },
  { ...baseEvent, aggregateId: 'wf1', sequence: 2, id: 'e2', type: 'LIFECYCLE',
    runtimeEpochId: 'epoch-2', payload: { kind: 'RUNTIME_CHANGED', fromEpochId: 'epoch-1',
      toEpochId: 'epoch-2', title: 'Runtime changed' } }
]

const reads = {
  getProject: async () => null, listProjects: async () => [],
  getWorkSessionOwnedByProject: async () => ({ id: 'ws1', projectId: 'p1', title: 'Work',
    goal: 'Goal', status: 'EXECUTING' as const, activeWorkflowRunId: 'wf1', createdAt: now, updatedAt: now }),
  listWorkSessionsByProject: async () => [],
  getWorkflowOwnedByProject: async () => ({ id: 'wf1', workSessionId: 'ws1',
    status: 'EXECUTING' as const, blockingGates: 0, createdAt: now, updatedAt: now }),
  listTasksByWorkflow: async () => [], listTaskRunsByWorkflow: async () => [],
  listAgentDefinitionsByProject: async () => [], listAgentRunsByWorkflow: async () => [],
  listRuntimeEpochsByWorkflow: async () => [], listReviewsByWorkflow: async () => [],
  listFindingsByWorkflow: async () => [], listArtifactsByProject: async () => []
} satisfies ProjectionReadPort

it('projects explicit runtime separators without interpreting narrated tool prose', async () => {
  const service = createWorkProjectionService({ reads, loadEvents: async () => events,
    revision: async () => 2 })
  const work = await service.getWorkProjection('p1', 'ws1', 'wf1')
  expect(work.conversation).toMatchObject({ status: 'AVAILABLE' })
  if (work.conversation.status !== 'AVAILABLE') throw new Error('conversation unavailable')
  expect(work.conversation.value).toContainEqual(expect.objectContaining({
    kind: 'RUNTIME_CHANGED', id: 'e2'
  }))
  expect(work.conversation.value[0]).toMatchObject({ kind: 'MESSAGE', body: 'Calling read({"path":"secret"})' })
  expect(work.conversation.value.filter(item => item.kind === 'TOOL')).toHaveLength(0)
})

it('maps internal approval, review failure and rework states to public task states', () => {
  expect(projectedTaskStatus('WAITING_APPROVAL')).toBe('BLOCKED')
  expect(projectedTaskStatus('REVIEW_FAILED')).toBe('FAILED')
  expect(projectedTaskStatus('REWORK')).toBe('READY')
})
