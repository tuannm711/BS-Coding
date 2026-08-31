import { describe, expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createPersistentUpdatePort } from '../../../src/main/v2/infrastructure/updates/sqlite-update-preferences'

function base(channels: string[]) {
  let channel: 'STABLE' | 'BETA' = 'STABLE'
  return {
    getStatus: () => ({ state: 'IDLE' as const, channel }),
    setChannel: (next: 'STABLE' | 'BETA') => { channel = next; channels.push(next) },
    check: async () => {}, download() {}, apply() {}, subscribe: () => () => {}
  }
}

describe('V2 update preferences', () => {
  it('restores the selected channel after reopening the adapter', () => {
    const db = openV2Database(':memory:')
    try {
      migrate(db)
      const firstChannels: string[] = []
      const first = createPersistentUpdatePort(db, base(firstChannels))
      first.setChannel('BETA')

      const restoredChannels: string[] = []
      const restored = createPersistentUpdatePort(db, base(restoredChannels))

      expect(restored.getStatus().channel).toBe('BETA')
      expect(restoredChannels).toEqual(['BETA'])
    } finally {
      db.close()
    }
  })
})
