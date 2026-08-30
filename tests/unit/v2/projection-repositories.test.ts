import { describe, expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRepositories } from '../../../src/main/v2/infrastructure/persistence/repositories'
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
})
