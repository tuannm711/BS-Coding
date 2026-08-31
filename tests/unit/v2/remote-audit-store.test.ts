import { describe, expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRemoteAuditStore } from '../../../src/main/v2/infrastructure/remote/sqlite-remote-audit'

describe('SQLite remote audit store', () => {
  it('persists connection and privileged command metadata without input secrets', async () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const store = createRemoteAuditStore(db, () => 'audit-1')

      await store.record({
        type: 'PRIVILEGED_COMMAND', command: 'workSession.cancel', deviceId: 'phone-1',
        timestamp: '2026-09-01T00:00:00.000Z', token: 'must-not-persist'
      } as never)

      expect(await store.list(10)).toEqual([{
        type: 'PRIVILEGED_COMMAND', command: 'workSession.cancel', deviceId: 'phone-1',
        timestamp: '2026-09-01T00:00:00.000Z'
      }])
      expect(JSON.stringify(db.prepare('SELECT * FROM remote_audit_events').all()))
        .not.toContain('must-not-persist')
    } finally {
      db.close()
    }
  })
})
