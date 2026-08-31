import { describe, expect, it } from 'vitest'
import { importAgents } from '../../../src/main/v2/infrastructure/migration/import-agents'
import { importProjects } from '../../../src/main/v2/infrastructure/migration/import-projects'
import { importProviders } from '../../../src/main/v2/infrastructure/migration/import-providers'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRepositories } from '../../../src/main/v2/infrastructure/persistence/repositories'

const now = '2026-08-31T00:00:00.000Z'

describe('V1 core metadata migration', () => {
  it('rerun keeps one project for a stable V1 source key', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      const input = [{ legacyId: 'C:/PMS', path: 'C:/PMS', name: 'PMS' }]

      const first = await importProjects(input, repositories, () => now)
      const second = await importProjects(input, repositories, () => now)

      expect(first).toMatchObject({ imported: 1, skipped: 0 })
      expect(first.importedIds).toHaveLength(1)
      expect(second).toEqual({ imported: 0, skipped: 1, importedIds: first.importedIds })
      expect(db.prepare('SELECT COUNT(*) AS count FROM projects').get()).toEqual({ count: 1 })
      expect(db.prepare(`SELECT source_type, source_key, imported_id FROM import_history
        WHERE source_type = 'v1:project'`).get()).toEqual({
          source_type: 'v1:project', source_key: 'C:/PMS', imported_id: first.importedIds[0]
        })
    } finally {
      db.close()
    }
  })

  it('persists provider metadata and vault reference without secret bytes', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      const legacy = [{
        legacyId: 'account-1', providerId: 'openai', label: 'Work', authMode: 'api-key',
        status: 'active', createdAt: 1_700_000_000_000, lastUsedAt: 1_700_000_001_000,
        keyRef: 'vault:provider/account-1', apiKey: 'must-not-be-persisted',
        providerNativeMetadata: { organization: 'unsupported' }
      }]

      const first = await importProviders(legacy, repositories, () => now)
      const second = await importProviders(legacy, repositories, () => now)
      const stored = await repositories.providerAccounts.get(first.importedIds[0])

      expect(first).toMatchObject({ imported: 1, skipped: 0 })
      expect(first.importedIds).toHaveLength(1)
      expect(second).toEqual({ imported: 0, skipped: 1, importedIds: first.importedIds })
      expect(stored).toEqual({
        id: first.importedIds[0], providerId: 'openai', label: 'Work', authMode: 'api-key',
        status: 'HEALTHY', enabled: true, vaultRef: 'vault:provider/account-1',
        createdAt: '2023-11-14T22:13:20.000Z', lastUsedAt: '2023-11-14T22:13:21.000Z',
        updatedAt: now
      })
      const persisted = JSON.stringify(db.prepare('SELECT * FROM provider_accounts').all())
      expect(persisted).not.toContain('must-not-be-persisted')
      expect(persisted).not.toContain('organization')
    } finally {
      db.close()
    }
  })

  it('creates one AgentDefinition and immutable AgentVersion per V1 agent', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      const project = await importProjects(
        [{ legacyId: 'C:/PMS', path: 'C:/PMS', name: 'PMS' }], repositories, () => now
      )
      const input = [{
        legacyId: 'agent-1', projectId: project.importedIds[0], name: 'Coordinator',
        templateId: 'claude', cwd: 'C:/PMS', kind: 'pty', mode: 'coordinate'
      }]

      const first = await importAgents(input, repositories, () => now)
      const before = db.prepare('SELECT payload_json FROM agent_versions').get() as {
        payload_json: string
      }
      const second = await importAgents(
        [{ ...input[0], mode: 'build' }], repositories, () => '2026-09-01T00:00:00.000Z'
      )

      expect(first.imported).toBe(1)
      expect(second).toEqual({ imported: 0, skipped: 1, importedIds: first.importedIds })
      expect(db.prepare('SELECT COUNT(*) AS count FROM agent_definitions').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM agent_versions').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT payload_json FROM agent_versions').get()).toEqual(before)
      expect(await repositories.agentDefinitions.get(first.importedIds[0])).toMatchObject({
        id: first.importedIds[0], projectId: project.importedIds[0], name: 'Coordinator',
        role: 'COORDINATOR'
      })
      const definition = await repositories.agentDefinitions.get(first.importedIds[0])
      expect(await repositories.agentVersions.get(definition!.currentVersionId!)).toEqual({
        id: definition!.currentVersionId, agentDefinitionId: definition!.id, revision: 1,
        systemInstructions: '', toolIds: [], skillIds: [], permissionProfile: {}, createdAt: now
      })
    } finally {
      db.close()
    }
  })

  it('repairs a missing AgentVersion after an interrupted first import', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      const project = await importProjects(
        [{ legacyId: 'C:/PMS', path: 'C:/PMS', name: 'PMS' }], repositories, () => now
      )
      const input = [{
        legacyId: 'agent-interrupted', projectId: project.importedIds[0], name: 'Worker',
        templateId: 'opencode', cwd: 'C:/PMS', mode: 'build'
      }]
      const interrupted = {
        ...repositories,
        agentVersions: {
          get: repositories.agentVersions.get,
          save: async () => { throw new Error('simulated interruption') }
        }
      }

      await expect(importAgents(input, interrupted, () => now)).rejects.toThrow('simulated interruption')
      const rerun = await importAgents(input, repositories, () => now)

      expect(rerun.importedIds).toHaveLength(1)
      expect(db.prepare('SELECT COUNT(*) AS count FROM agent_definitions').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM agent_versions').get()).toEqual({ count: 1 })
    } finally {
      db.close()
    }
  })
})
