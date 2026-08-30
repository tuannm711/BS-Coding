import { expect, it } from 'vitest'
import { createV2Services } from '../../../src/main/v2/application/create-v2-services'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { createRepositories } from '../../../src/main/v2/infrastructure/persistence/repositories'
import { SqliteEventStore } from '../../../src/main/v2/infrastructure/persistence/sqlite-event-store'
import { createV2Routes } from '../../../src/main/v2/ipc/create-v2-routes'
import { P15_IPC } from '../../../src/shared/v2/contracts/p15-backend-ipc'
import { P15PublicIpcSchemas } from '../../../src/shared/v2/schemas/p15-backend-ipc'
import type { Project } from '../../../src/shared/v2/contracts/domain'

it('serves a seeded Project through a real validated route', async () => {
  const db = openV2Database(':memory:')
  try {
    migrate(db)
    const repositories = createRepositories(db)
    const events = new SqliteEventStore(db)
    const services = createV2Services({ repositories, loadEvents: (id: string) => events.load(id), support: {
      getWorkspace: async () => ({ status: 'EMPTY' }),
      getGitStatus: async () => ({ status: 'EMPTY' }),
      listProviderAccounts: async () => [],
      listSkillBindings: async () => ({ status: 'EMPTY' }),
      listMcpServers: async () => ({ status: 'EMPTY' }),
      listDiagnostics: async () => ({ status: 'EMPTY' })
    } } as never)
    const project: Project = { id: 'p1', name: 'PMS', repoPath: 'C:/PMS',
      defaultBranch: 'master', instructionsRef: 'AGENTS.md',
      createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z' }
    await repositories.projects.save(project)

    const routes = createV2Routes(services)
    expect(routes.map(item => item.channel).sort()).toEqual(Object.entries(P15_IPC)
      .filter(([key]) => key !== 'workflow.projection').map(([, channel]) => channel).sort())
    const listRoute = routes.find(item => item.channel === P15_IPC['project.list'])
    const getRoute = routes.find(item => item.channel === P15_IPC['project.get'])
    await expect(listRoute!.handler({}, {})).resolves.toMatchObject({
      projects: [{ id: 'p1', name: 'PMS', activeWorkCount: 0 }]
    })
    await expect(getRoute!.handler({}, { id: 'p1' })).resolves.toMatchObject({
      id: 'p1', name: 'PMS', activeWorkCount: 0
    })
  } finally {
    db.close()
  }
})
