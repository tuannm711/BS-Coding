import { describe, expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import {
  createRepositories, PROJECTION_LIST_LIMIT, type PersistedRuntimeEpoch
} from '../../../src/main/v2/infrastructure/persistence/repositories'
import type { Project, WorkSession, WorkflowRun } from '../../../src/shared/v2/contracts/domain'

const older = '2026-08-29T00:00:00.000Z'
const newer = '2026-08-30T00:00:00.000Z'
const project = (id: string, updatedAt: string): Project => ({
  id, name: id, repoPath: `C:/${id}`, defaultBranch: 'master', instructionsRef: 'AGENTS.md',
  createdAt: older, updatedAt
})
const session = (id: string, projectId: string, updatedAt: string): WorkSession => ({
  id, projectId, title: id, goal: id, status: 'PLANNING', createdAt: older, updatedAt
})

describe('owner-scoped projection repositories', () => {
  it('filters by owner and orders projection lists deterministically', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      await repositories.projects.save(project('p1', older))
      await repositories.projects.save(project('p2', newer))
      await repositories.workSessions.save(session('ws-old', 'p1', older))
      await repositories.workSessions.save(session('ws-new', 'p1', newer))
      await repositories.workSessions.save(session('ws-foreign', 'p2', newer))

      expect((await repositories.projections.listProjects()).map(item => item.id))
        .toEqual(['p2', 'p1'])
      expect((await repositories.projections.listWorkSessionsByProject('p1')).map(item => item.id))
        .toEqual(['ws-new', 'ws-old'])
      expect(await repositories.projections.getWorkSessionOwnedByProject('p1', 'ws-foreign'))
        .toBeNull()
    } finally {
      db.close()
    }
  })

  it('verifies the complete Project to WorkSession to Workflow ownership chain', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      await repositories.projects.save(project('p1', older))
      await repositories.projects.save(project('p2', older))
      await repositories.workSessions.save(session('ws1', 'p1', older))
      const workflow: WorkflowRun = {
        id: 'wf1', workSessionId: 'ws1', status: 'EXECUTING', blockingGates: 0,
        createdAt: older, updatedAt: older
      }
      await repositories.workflowRuns.save(workflow)

      expect(await repositories.projections.getWorkflowOwnedByProject('p1', 'wf1'))
        .toEqual(workflow)
      expect(await repositories.projections.getWorkflowOwnedByProject('p2', 'wf1'))
        .toBeNull()
    } finally {
      db.close()
    }
  })

  it('rejects malformed persisted payloads at the projection read boundary', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      db.prepare('INSERT INTO projects(id, payload_json) VALUES (?, ?)')
        .run('broken', JSON.stringify({ id: 'broken', updatedAt: newer }))

      await expect(repositories.projections.listProjects()).rejects.toThrow()
    } finally {
      db.close()
    }
  })

  it('persists RuntimeEpoch ownership while projecting only safe runtime fields', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      db.exec(`
        INSERT INTO projects VALUES ('p1', '{"id":"p1"}');
        INSERT INTO work_sessions VALUES ('ws1', 'p1', '{"id":"ws1"}');
        INSERT INTO workflow_runs VALUES ('wf1', 'ws1', '{"id":"wf1"}');
        INSERT INTO tasks VALUES ('t1', 'wf1', '{"id":"t1"}');
        INSERT INTO task_runs VALUES ('tr1', 't1', 'wf1', '{"id":"tr1"}');
        INSERT INTO agent_definitions VALUES ('ad1', 'p1', '{"id":"ad1"}');
        INSERT INTO agent_versions VALUES ('av1', 'ad1', '{"id":"av1"}');
        INSERT INTO agent_runs VALUES ('ar1', 'tr1', 'av1', '{"id":"ar1"}');
      `)
      const epoch: PersistedRuntimeEpoch = { id: 'epoch-1', agentRunId: 'ar1',
        workSessionId: 'ws1', status: 'ACTIVE', providerId: 'openai', accountId: 'account-1',
        modelId: 'model-1', reason: 'INITIAL', startedAt: newer }
      await repositories.runtimeEpochs.save(epoch)

      expect(await repositories.runtimeEpochs.get(epoch.id)).toEqual(epoch)
      expect(await repositories.projections.listRuntimeEpochsByWorkflow('wf1')).toEqual([{
        id: 'epoch-1', status: 'ACTIVE', providerId: 'openai', accountId: 'account-1',
        modelId: 'model-1', startedAt: newer
      }])
    } finally {
      db.close()
    }
  })

  it('bounds project projections while preserving deterministic recency order', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      const insert = db.prepare('INSERT INTO projects(id, payload_json) VALUES (?, ?)')
      const seed = db.transaction(() => {
        for (let index = 0; index < PROJECTION_LIST_LIMIT + 2; index += 1) {
          const id = `project-${String(index).padStart(4, '0')}`
          insert.run(id, JSON.stringify(project(id,
            new Date(Date.parse(older) + index * 1000).toISOString())))
        }
      })
      seed()
      const values = await repositories.projections.listProjects()
      expect(values).toHaveLength(PROJECTION_LIST_LIMIT)
      expect(values[0].id).toBe(`project-${String(PROJECTION_LIST_LIMIT + 1).padStart(4, '0')}`)
    } finally {
      db.close()
    }
  })
})
