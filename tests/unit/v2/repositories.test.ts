import { describe, expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { LegacyArtifactAdapter } from '../../../src/main/v2/infrastructure/artifacts/legacy-artifact-adapter'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRepositories } from '../../../src/main/v2/infrastructure/persistence/repositories'
import type { Project, WorkSession } from '../../../src/shared/v2/contracts/domain'

const now = '2026-08-29T00:00:00.000Z'

const project: Project = {
  id: 'p',
  name: 'BS Coding',
  repoPath: 'C:/repo',
  defaultBranch: 'master',
  instructionsRef: 'AGENTS.md',
  createdAt: now,
  updatedAt: now
}

const workSession: WorkSession = {
  id: 'w',
  projectId: project.id,
  title: 'P03',
  goal: 'Persistence',
  status: 'PLANNING',
  createdAt: now,
  updatedAt: now
}

describe('V2 repositories', () => {
  it('round trips domain projections through typed repositories', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      await repositories.projects.save(project)
      await repositories.workSessions.save(workSession)

      expect(await repositories.projects.get(project.id)).toEqual(project)
      expect(await repositories.workSessions.get(workSession.id)).toEqual(workSession)
    } finally {
      db.close()
    }
  })

  it('enforces aggregate ownership with foreign keys', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      await expect(repositories.workSessions.save({ ...workSession, projectId: 'missing' }))
        .rejects.toThrow(/foreign key/i)
    } finally {
      db.close()
    }
  })

  it('stores artifact metadata without an artifact byte column', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      await repositories.projects.save(project)
      const artifact = {
        id: 'a', projectId: project.id, kind: 'edit', path: 'C:/repo/a.ts', size: 12
      }
      await repositories.artifacts.save(artifact)

      expect(await repositories.artifacts.get('a')).toEqual(artifact)
      const columns = db.prepare('PRAGMA table_info(artifacts)').all() as Array<{ name: string }>
      expect(columns.map(column => column.name)).not.toContain('artifact_bytes')
      const queryPlan = db.prepare(
        'EXPLAIN QUERY PLAN SELECT * FROM artifacts WHERE project_id = ? ORDER BY id'
      ).all(project.id) as Array<{ detail: string }>
      expect(queryPlan.some(row => /artifacts_project_id_idx/i.test(row.detail))).toBe(true)
    } finally {
      db.close()
    }
  })
})

describe('legacy artifact compatibility', () => {
  it('maps legacy entries to V2 references without reading file bytes', () => {
    const adapter = new LegacyArtifactAdapter({
      list: () => [{
        id: 'a', path: 'src/a.ts', absPath: 'C:/repo/src/a.ts', kind: 'edit',
        agentId: 'agent', agentName: 'Agent', ts: 1
      }]
    }, () => 12)

    expect(adapter.list('p', 'C:/repo')).toEqual([{
      id: 'a', projectId: 'p', kind: 'edit', path: 'C:/repo/src/a.ts', size: 12
    }])
  })
})
