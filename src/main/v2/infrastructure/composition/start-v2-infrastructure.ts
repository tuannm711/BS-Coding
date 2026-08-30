import type { V2CompositionSupport } from '../../application/create-v2-services'
import { createV2Services } from '../../application/create-v2-services'
import { createV2Routes } from '../../ipc/create-v2-routes'
import { registerV2Ipc, type V2IpcRegistrar } from '../../ipc/register-v2-ipc'
import { openV2Database } from '../persistence/database'
import { migrate } from '../persistence/migration-runner'
import { createRepositories } from '../persistence/repositories'
import type { V2Repositories } from '../persistence/repositories'
import { SqliteEventStore } from '../persistence/sqlite-event-store'

export async function startV2Infrastructure(input: {
  databasePath: string
  registrar: V2IpcRegistrar
  support: V2CompositionSupport | ((context: { repositories: V2Repositories }) => V2CompositionSupport)
}): Promise<{ dispose(): Promise<void> }> {
  const db = openV2Database(input.databasePath)
  try {
    migrate(db)
    const repositories = createRepositories(db)
    const events = new SqliteEventStore(db)
    const support = typeof input.support === 'function' ? input.support({ repositories }) : input.support
    const services = createV2Services({ repositories, loadEvents: id => events.load(id),
      support })
    const unregister = registerV2Ipc({ registrar: input.registrar, routes: createV2Routes(services) })
    let disposed = false
    return { dispose: async () => {
      if (disposed) return
      disposed = true
      unregister()
      db.close()
    } }
  } catch (error) {
    db.close()
    throw error
  }
}
