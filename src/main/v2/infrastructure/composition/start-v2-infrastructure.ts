import type { V2CompositionSupport } from '../../application/create-v2-services'
import { createV2Services } from '../../application/create-v2-services'
import { createV2Routes } from '../../ipc/create-v2-routes'
import { registerV2Ipc, type V2IpcRegistrar } from '../../ipc/register-v2-ipc'
import { openV2Database } from '../persistence/database'
import { migrate } from '../persistence/migration-runner'
import { createRepositories } from '../persistence/repositories'
import type { V2Repositories } from '../persistence/repositories'
import { SqliteEventStore } from '../persistence/sqlite-event-store'
import { SqliteUnitOfWork } from '../persistence/sqlite-unit-of-work'
import { createProjectionPublisher } from '../../ipc/projection-publisher'
import type { WorkflowRun } from '../../../../shared/v2/contracts/domain'
import type { ProjectionEvent } from '../../../../shared/v2/contracts/ipc'
import { createBudgetPolicyRepository, createUsageRepository } from '../persistence/usage-repository'
import { UsageLedger } from '../../application/observability/usage-ledger'
import { createRemoteAuditStore, type RemoteAuditStore } from '../remote/sqlite-remote-audit'
import { P15PublicIpcSchemas } from '../../../../shared/v2/schemas/p15-backend-ipc'

export async function startV2Infrastructure(input: {
  databasePath: string
  registrar: V2IpcRegistrar
  support: V2CompositionSupport | ((context: { repositories: V2Repositories }) => V2CompositionSupport)
  sendProjection?(event: ProjectionEvent<WorkflowRun>): void
}): Promise<{
  dispose(): Promise<void>
  execute(name: string, input: unknown): Promise<unknown>
  remoteAudit: RemoteAuditStore
}> {
  const db = openV2Database(input.databasePath)
  try {
    migrate(db)
    const repositories = createRepositories(db)
    const events = new SqliteEventStore(db)
    const unitOfWork = new SqliteUnitOfWork(db)
    const usage = new UsageLedger(createUsageRepository(db))
    const budgets = createBudgetPolicyRepository(db)
    const remoteAudit = createRemoteAuditStore(db)
    const support = typeof input.support === 'function' ? input.support({ repositories }) : input.support
    const publisher = input.sendProjection ? createProjectionPublisher({ send: input.sendProjection }) : undefined
    const services = createV2Services({ repositories, events, support, usage, budgets,
      transaction: operation => unitOfWork.run(operation),
      publishWorkflow: publisher ? (workflow, revision) => { publisher.publish(revision, workflow) } : undefined })
    const unregister = registerV2Ipc({ registrar: input.registrar, routes: createV2Routes(services) })
    let disposed = false
    return {
      remoteAudit,
      execute: async (name, value) => {
        const handler = services.handlers[name]
        const contract = P15PublicIpcSchemas[name as keyof typeof P15PublicIpcSchemas] as
          | { request?: { parse(input: unknown): unknown }; response?: { parse(input: unknown): unknown } }
          | undefined
        if (!handler || !contract?.request || !contract.response) {
          throw new Error(`unsupported V2 command ${name}`)
        }
        const result = await handler(contract.request.parse(value))
        return contract.response.parse(result)
      },
      dispose: async () => {
        if (disposed) return
        disposed = true
        unregister()
        db.close()
      }
    }
  } catch (error) {
    db.close()
    throw error
  }
}
