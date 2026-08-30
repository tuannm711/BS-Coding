import { expect, it, vi } from 'vitest'
import { createV2Services } from '../../../src/main/v2/application/create-v2-services'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { createRepositories, type PersistedRuntimeEpoch } from '../../../src/main/v2/infrastructure/persistence/repositories'
import { SqliteEventStore } from '../../../src/main/v2/infrastructure/persistence/sqlite-event-store'
import { SqliteUnitOfWork } from '../../../src/main/v2/infrastructure/persistence/sqlite-unit-of-work'
import { createV2Routes } from '../../../src/main/v2/ipc/create-v2-routes'
import { P15_IPC } from '../../../src/shared/v2/contracts/p15-backend-ipc'
import { P15PublicIpcSchemas } from '../../../src/shared/v2/schemas/p15-backend-ipc'
import type { Project } from '../../../src/shared/v2/contracts/domain'

it('serves a seeded Project through a real validated route', async () => {
  const db = openV2Database(':memory:')
  try {
    migrate(db)
    const repositories = createRepositories(db)
    const events = new SqliteEventStore(db)
    const unit = new SqliteUnitOfWork(db)
    const services = createV2Services({ repositories, events,
      transaction: <T>(operation: () => Promise<T>) => unit.run(operation), support: {
      getWorkspace: async () => ({ status: 'EMPTY' }),
      getGitStatus: async () => ({ status: 'EMPTY' }),
      listProviderAccounts: async () => [],
      listSkillBindings: async () => ({ status: 'EMPTY' }),
      listMcpServers: async () => ({ status: 'EMPTY' }),
      listDiagnostics: async () => ({ status: 'EMPTY' })
    } } as never)
    const project: Project = { id: 'p1', name: 'PMS', repoPath: 'C:/PMS',
      defaultBranch: 'master', instructionsRef: 'AGENTS.md',
      createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z' }
    await repositories.projects.save(project)

    const routes = createV2Routes(services)
    expect(routes.map(item => item.channel).sort()).toEqual(Object.entries(P15_IPC)
      .filter(([key]) => key !== 'workflow.projection').map(([, channel]) => channel).sort())
    const listRoute = routes.find(item => item.channel === P15_IPC['project.list'])
    const getRoute = routes.find(item => item.channel === P15_IPC['project.get'])
    await expect(listRoute!.handler({}, {})).resolves.toMatchObject({
      projects: [{ id: 'p1', name: 'PMS', activeWorkCount: 0 }]
    })
    await expect(getRoute!.handler({}, { id: 'p1' })).resolves.toMatchObject({
      id: 'p1', name: 'PMS', activeWorkCount: 0
    })
  } finally {
    db.close()
  }
})

it('switches runtime through durable RuntimeEpoch state', async () => {
  const db = openV2Database(':memory:')
  try {
    migrate(db)
    const repositories = createRepositories(db)
    const events = new SqliteEventStore(db)
    const unit = new SqliteUnitOfWork(db)
    const ids = ['event-close', 'epoch-new', 'event-start', 'rework-task']
    const publishWorkflow = vi.fn()
    const services = createV2Services({ repositories, events,
      transaction: <T>(operation: () => Promise<T>) => unit.run(operation),
      publishWorkflow,
      now: () => '2026-08-30T01:00:00.000Z', nextId: () => ids.shift()!, support: {
        getWorkspace: async () => ({ status: 'EMPTY' }), getGitStatus: async () => ({ status: 'EMPTY' }),
        listProviderAccounts: async () => [], listSkillBindings: async () => ({ status: 'EMPTY' }),
        listMcpServers: async () => ({ status: 'EMPTY' }), listDiagnostics: async () => ({ status: 'EMPTY' })
      } } as never)
    const createdAt = '2026-08-30T00:00:00.000Z'
    await repositories.projects.save({ id: 'p1', name: 'PMS', repoPath: 'C:/PMS',
      defaultBranch: 'master', instructionsRef: 'AGENTS.md', createdAt, updatedAt: createdAt })
    await repositories.workSessions.save({ id: 'ws1', projectId: 'p1', title: 'Work', goal: 'Work',
      status: 'EXECUTING', activeWorkflowRunId: 'wf1', createdAt, updatedAt: createdAt })
    await repositories.workflowRuns.save({ id: 'wf1', workSessionId: 'ws1', status: 'EXECUTING',
      blockingGates: 0, createdAt, updatedAt: createdAt })
    await repositories.tasks.save({ id: 't1', workflowRunId: 'wf1', title: 'Task', dependsOn: [],
      createdAt, updatedAt: createdAt })
    await repositories.taskRuns.save({ id: 'tr1', taskId: 't1', workflowRunId: 'wf1', attempt: 1,
      status: 'RUNNING', createdAt, updatedAt: createdAt })
    await repositories.agentDefinitions.save({ id: 'ad1', projectId: 'p1', name: 'Worker', role: 'WORKER',
      currentVersionId: 'av1', createdAt, updatedAt: createdAt })
    await repositories.agentVersions.save({ id: 'av1', agentDefinitionId: 'ad1', revision: 1,
      systemInstructions: 'Work', toolIds: [], skillIds: [], permissionProfile: {}, createdAt })
    await repositories.agentRuns.save({ id: 'ar1', taskRunId: 'tr1', agentVersionId: 'av1',
      status: 'RUNNING', createdAt, updatedAt: createdAt })
    await repositories.runtimeEpochs.save({ id: 'epoch-old', agentRunId: 'ar1', workSessionId: 'ws1',
      status: 'ACTIVE', providerId: 'openai', accountId: 'old', modelId: 'old', reason: 'INITIAL',
      startedAt: createdAt } satisfies PersistedRuntimeEpoch)

    await services.handlers['workSession.switchRuntime']({ requestId: 'request-switch', input: {
      projectId: 'p1', workSessionId: 'ws1', target: { providerId: 'openai', accountId: 'new',
        modelId: 'new', capabilities: { structuredTools: 'VERIFIED' } }, reason: 'fallback' } })

    expect(await repositories.runtimeEpochs.get('epoch-old')).toMatchObject({
      status: 'CLOSED', reason: 'INITIAL', endReason: 'fallback',
      endedAt: '2026-08-30T01:00:00.000Z' })
    expect(await repositories.runtimeEpochs.get('epoch-new')).toMatchObject({
      status: 'ACTIVE', accountId: 'new', modelId: 'new' })
    expect(publishWorkflow).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'wf1' }), 2)

    await repositories.reviews.save({ id: 'review-1', workflowRunId: 'wf1',
      reviewerAgentVersionId: 'av1', scope: ['Task 7'], decision: 'FAIL',
      findingIds: ['finding-1'], createdAt } as never)
    await repositories.findings.save({ id: 'finding-1', reviewId: 'review-1', severity: 'HIGH',
      blocking: true, category: 'correctness', description: 'Needs rework',
      evidenceRefs: ['artifact-1'], affectedFiles: ['src/a.ts'], reviewerAgentVersionId: 'av1',
      status: 'OPEN' } as never)
    await services.handlers['workflow.createRework']({ requestId: 'request-rework', input: {
      projectId: 'p1', workSessionId: 'ws1', findingIds: ['finding-1'], title: 'Fix finding' } })
    expect(await repositories.findings.get('finding-1')).toMatchObject({
      linkedReworkTaskId: expect.any(String) })
    expect((await repositories.projections.listTasksByWorkflow('wf1'))
      .some(task => task.title === 'Fix finding')).toBe(true)
  } finally {
    db.close()
  }
})
