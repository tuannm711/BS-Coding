import type BetterSqlite3 from 'better-sqlite3'
import type { UpdateChannel } from '../../../../shared/v2/contracts/update'
import type { UpdatePort } from '../../application/ports/update-port'

export function createPersistentUpdatePort(
  db: BetterSqlite3.Database,
  base: UpdatePort
): UpdatePort {
  const row = db.prepare("SELECT channel FROM update_preferences WHERE id = 'global'")
    .get() as { channel: UpdateChannel } | undefined
  if (row) base.setChannel(row.channel)
  return {
    getStatus: () => base.getStatus(),
    setChannel(channel) {
      base.setChannel(channel)
      db.prepare(`INSERT INTO update_preferences(id, channel, updated_at)
        VALUES ('global', ?, ?) ON CONFLICT(id) DO UPDATE SET
        channel = excluded.channel, updated_at = excluded.updated_at`)
        .run(channel, new Date().toISOString())
    },
    check: () => base.check(), download: () => base.download(), apply: () => base.apply(),
    subscribe: listener => base.subscribe(listener)
  }
}
