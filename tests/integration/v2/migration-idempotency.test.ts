import { describe, expect, it } from 'vitest'
import { createMigrationRunner } from '../../../src/main/v2/infrastructure/migration/migration-runner'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRepositories } from '../../../src/main/v2/infrastructure/persistence/repositories'

const manifest = {
  createdAt: '2026-08-31T00:00:00.000Z', sourceVersion: '1.3.2' as const,
  files: [{ path: 'sessions.json', sha256: 'a'.repeat(64), size: 128 }]
}

describe('resumable V1 migration runner', () => {
  it('resumes after interruption without rerunning completed stages', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const history = createRepositories(db).importHistory
      const calls: string[] = []
      let failSessions = true
      const stage = (name: string) => async () => {
        calls.push(name)
        if (name === 'sessions' && failSessions) {
          failSessions = false
          throw new Error('simulated interruption')
        }
        return { imported: 1, skipped: 0, errors: 0 }
      }
      const runner = createMigrationRunner({
        backup: async () => ({ backupPath: 'C:/backup/2026-08-31', manifest }),
        history,
        stages: {
          projects: stage('projects'), providers: stage('providers'), agents: stage('agents'),
          sessions: stage('sessions'), usage: stage('usage')
        },
        inspect: async () => ({
          stages: ['projects', 'providers', 'agents', 'sessions', 'usage'].map(name => ({
            name, sourceCount: 1, targetCount: 1, archived: 0, unattributed: 0, errors: 0
          })),
          samples: [{ name: 'project:C:/PMS', matched: true }]
        })
      })

      await expect(runner.run()).rejects.toThrow('simulated interruption')
      const report = await runner.run()

      expect(calls).toEqual([
        'projects', 'providers', 'agents', 'sessions', 'sessions', 'usage'
      ])
      expect(report).toMatchObject({
        backupPath: 'C:/backup/2026-08-31', validated: true,
        completedStages: ['projects', 'providers', 'agents', 'sessions', 'usage']
      })
      expect(report.stages.map(stage => [stage.name, stage.status])).toEqual([
        ['projects', 'CHECKPOINTED'], ['providers', 'CHECKPOINTED'],
        ['agents', 'CHECKPOINTED'], ['sessions', 'COMPLETED'], ['usage', 'COMPLETED']
      ])
    } finally {
      db.close()
    }
  })

  it('rejects an invalid backup manifest before running a stage', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      let writes = 0
      const noWrite = async () => { writes += 1; return { imported: 0, skipped: 0, errors: 0 } }
      const runner = createMigrationRunner({
        backup: async () => ({ backupPath: 'C:/backup/bad',
          manifest: { ...manifest, files: [{ ...manifest.files[0], sha256: 'bad' }] } }),
        history: createRepositories(db).importHistory,
        stages: { projects: noWrite, providers: noWrite, agents: noWrite,
          sessions: noWrite, usage: noWrite },
        inspect: async () => ({ stages: [], samples: [] })
      })

      await expect(runner.run()).rejects.toThrow(/manifest/i)
      expect(writes).toBe(0)
    } finally {
      db.close()
    }
  })

  it('does not checkpoint an invalid stage result', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const history = createRepositories(db).importHistory
      const empty = async () => ({ imported: 0, skipped: 0, errors: 0 })
      const runner = createMigrationRunner({
        backup: async () => ({ backupPath: 'C:/backup/stage', manifest }),
        history,
        stages: { projects: async () => ({ imported: -1, skipped: 0, errors: 0 }),
          providers: empty, agents: empty, sessions: empty, usage: empty },
        inspect: async () => ({ stages: [], samples: [] })
      })

      await expect(runner.run()).rejects.toThrow(/stage result/i)
      expect(await history.get('v1:migration-stage', 'projects')).toBeNull()
    } finally {
      db.close()
    }
  })

  it('rejects an unsupported source version before writes', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      let writes = 0
      const noWrite = async () => { writes += 1; return { imported: 0, skipped: 0, errors: 0 } }
      const runner = createMigrationRunner({
        backup: async () => ({ backupPath: 'C:/backup/version',
          manifest: { ...manifest, sourceVersion: '1.3.1' as never } }),
        history: createRepositories(db).importHistory,
        stages: { projects: noWrite, providers: noWrite, agents: noWrite,
          sessions: noWrite, usage: noWrite },
        inspect: async () => ({ stages: [], samples: [] })
      })

      await expect(runner.run()).rejects.toThrow(/manifest/i)
      expect(writes).toBe(0)
    } finally {
      db.close()
    }
  })

  it('does not validate when inspection omits a required migration stage', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const empty = async () => ({ imported: 0, skipped: 0, errors: 0 })
      const runner = createMigrationRunner({
        backup: async () => ({ backupPath: 'C:/backup/complete', manifest }),
        history: createRepositories(db).importHistory,
        stages: { projects: empty, providers: empty, agents: empty, sessions: empty, usage: empty },
        inspect: async () => ({
          stages: ['projects', 'providers', 'agents', 'sessions'].map(name => ({
            name, sourceCount: 0, targetCount: 0, archived: 0, unattributed: 0, errors: 0
          })),
          samples: []
        })
      })

      const report = await runner.run()

      expect(report.validated).toBe(false)
      expect(report.validationErrors).toContain('usage: missing stage inspection')
    } finally {
      db.close()
    }
  })
})
