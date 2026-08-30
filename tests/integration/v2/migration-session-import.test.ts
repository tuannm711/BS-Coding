import { describe, expect, it } from 'vitest'
import { importProjects } from '../../../src/main/v2/infrastructure/migration/import-projects'
import { importSessions } from '../../../src/main/v2/infrastructure/migration/import-sessions'
import { convertLegacyItem } from '../../../src/main/v2/infrastructure/migration/v1-transcript-converter'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRepositories } from '../../../src/main/v2/infrastructure/persistence/repositories'
import { SqliteEventStore } from '../../../src/main/v2/infrastructure/persistence/sqlite-event-store'

const createdAt = '2023-11-14T22:13:20.000Z'
const updatedAt = '2023-11-14T22:13:22.000Z'

describe('V1 transcript conversion', () => {
  it('converts a tool item into structured events without provider signature metadata', () => {
    const events = convertLegacyItem({
      kind: 'tool',
      tool: {
        id: 'call-1', tool: 'read', input: { path: 'a.ts' }, output: 'contents',
        permission: 'allowed', thoughtSignature: 'provider-secret', turnId: 'turn-1',
        execution: {
          turnId: 'turn-1', agentId: 'agent-1', agentName: 'Worker', providerId: 'openai',
          accountId: 'provider-native-account', modelId: 'provider-native-model', speed: 'standard',
          startedAt: 1_700_000_000_000, completedAt: 1_700_000_002_000, status: 'completed'
        }
      }
    }, createdAt)

    expect(events).toEqual([
      {
        type: 'TOOL_CALL', timestamp: createdAt, correlationId: 'turn-1',
        payload: {
          callId: 'call-1', toolName: 'read', arguments: { path: 'a.ts' }, origin: 'model',
          requestedAt: createdAt
        }
      },
      {
        type: 'TOOL_RESULT', timestamp: updatedAt, correlationId: 'turn-1',
        payload: {
          callId: 'call-1', status: 'success', preview: 'contents', completedAt: updatedAt
        }
      }
    ])
    expect(JSON.stringify(events)).not.toMatch(/thoughtSignature|provider-native|providerId|accountId/)
  })
})

describe('V1 session import', () => {
  it('persists one historical WorkSession and canonical event stream on rerun', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      await importProjects(
        [{ legacyId: 'C:/PMS', path: 'C:/PMS', name: 'PMS' }], repositories, () => createdAt
      )
      const events = new SqliteEventStore(db)
      const session = {
        schemaVersion: 2, id: 'session-1', agentId: 'agent-1', projectPath: 'C:/PMS',
        title: 'Fix auth', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_002_000,
        items: [
          { kind: 'message', message: {
            id: 'message-1', role: 'user', text: 'Fix auth', turnId: 'turn-1',
            createdAt: 1_700_000_000_000
          } },
          { kind: 'message', message: {
            id: 'message-2', role: 'assistant', text: 'Done', turnId: 'turn-1',
            createdAt: 1_700_000_002_000
          } }
        ]
      }

      const first = await importSessions([session], { repositories, events })
      const second = await importSessions([session], { repositories, events })
      const storedEvents = await events.load(first.importedIds[0])

      expect(first).toMatchObject({ imported: 1, skipped: 0, archived: 0 })
      expect(second).toEqual({
        imported: 0, skipped: 1, archived: 0,
        importedIds: first.importedIds, archivedLegacyIds: []
      })
      expect(await repositories.workSessions.get(first.importedIds[0])).toEqual({
        id: first.importedIds[0], projectId: expect.any(String), title: 'Fix auth', goal: 'Fix auth',
        status: 'COMPLETED', createdAt, updatedAt, completedAt: updatedAt
      })
      expect(storedEvents.map(event => [event.type, event.payload])).toEqual([
        ['USER_MESSAGE', { text: 'Fix auth' }],
        ['ASSISTANT_MESSAGE', { text: 'Done' }]
      ])
    } finally {
      db.close()
    }
  })

  it('records ambiguous coordination history as legacy archive without canonical events', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      await importProjects(
        [{ legacyId: 'C:/PMS', path: 'C:/PMS', name: 'PMS' }], repositories, () => createdAt
      )
      const events = new SqliteEventStore(db)
      const session = {
        schemaVersion: 2, id: 'coordination-1', agentId: 'coordinator', projectPath: 'C:/PMS',
        kind: 'coordination', title: 'Fleet run', createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_002_000, items: [{ kind: 'message', message: {
          id: 'message-1', role: 'assistant', text: 'Unattributed result', createdAt: 1_700_000_002_000
        } }]
      }

      const result = await importSessions([session], { repositories, events })

      expect(result).toEqual({
        imported: 0, skipped: 0, archived: 1,
        importedIds: [], archivedLegacyIds: ['coordination-1']
      })
      expect(db.prepare('SELECT COUNT(*) AS count FROM work_sessions').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM canonical_events').get()).toEqual({ count: 0 })
      expect(db.prepare(`SELECT imported_id FROM import_history
        WHERE source_type = 'v1:session-archive' AND source_key = 'coordination-1'`).get())
        .toEqual({ imported_id: 'legacy-archive:coordination-1' })
    } finally {
      db.close()
    }
  })

  it('redacts credential-like tool arguments before canonical persistence', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const repositories = createRepositories(db)
      await importProjects(
        [{ legacyId: 'C:/PMS', path: 'C:/PMS', name: 'PMS' }], repositories, () => createdAt
      )
      const events = new SqliteEventStore(db)
      const session = {
        id: 'session-secret', agentId: 'agent-1', projectPath: 'C:/PMS', title: 'Connect',
        createdAt: 1_700_000_000_000, updatedAt: 1_700_000_002_000,
        items: [{ kind: 'tool', tool: {
          id: 'call-secret', tool: 'connect',
          input: { apiKey: 'raw-secret', endpoint: 'https://example.invalid' },
          output: 'ok', permission: 'allowed'
        } }]
      }

      const result = await importSessions([session], { repositories, events })
      const stored = await events.load(result.importedIds[0])

      expect(stored[0].payload).toMatchObject({
        arguments: { apiKey: '[REDACTED]', endpoint: 'https://example.invalid' }
      })
      expect(JSON.stringify(db.prepare('SELECT payload_json FROM canonical_events').all()))
        .not.toContain('raw-secret')
    } finally {
      db.close()
    }
  })
})
