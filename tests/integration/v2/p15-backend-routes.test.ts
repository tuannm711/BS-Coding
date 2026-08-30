import { expect, it } from 'vitest'
import { createV2Routes } from '../../../src/main/v2/ipc/create-v2-routes'
import { P15_IPC } from '../../../src/shared/v2/contracts/p15-backend-ipc'
import { P15PublicIpcSchemas } from '../../../src/shared/v2/schemas/p15-backend-ipc'

it('serves a seeded Project through a real validated route', async () => {
  const handlers: Record<string, (input: unknown) => Promise<unknown>> = Object.fromEntries(
    Object.keys(P15PublicIpcSchemas).filter(key => key !== 'workflow.projection')
      .map(key => [key, async (_input: unknown) => undefined]))
  handlers['project.get'] = async (input: unknown) => ({ id: (input as { id: string }).id,
    name: 'PMS', repoPath: 'C:/PMS', defaultBranch: 'master', activeWorkCount: 1,
    updatedAt: '2026-08-30T00:00:00.000Z', revision: 2 })
  const routes = createV2Routes({ handlers } as never)
  expect(routes.map(item => item.channel).sort()).toEqual(Object.entries(P15_IPC)
    .filter(([key]) => key !== 'workflow.projection').map(([, channel]) => channel).sort())
  const route = routes.find(item => item.channel === P15_IPC['project.get'])
  expect(route).toBeDefined()
  await expect(route!.handler({}, { id: 'p1' })).resolves.toMatchObject({ id: 'p1', name: 'PMS' })
})
