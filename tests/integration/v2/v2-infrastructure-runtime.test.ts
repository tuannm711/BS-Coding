import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { startV2Infrastructure } from '../../../src/main/v2/infrastructure/composition/start-v2-infrastructure'
import { P15PublicIpcSchemas } from '../../../src/shared/v2/schemas/p15-backend-ipc'

it('owns migrated persistence and every validated P15 route', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bs-v2-runtime-'))
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>()
  const removeHandler = vi.fn((channel: string) => { handlers.delete(channel) })
  let runtime: { dispose(): Promise<void> } | undefined
  try {
    runtime = await startV2Infrastructure({ databasePath: path.join(dir, 'state.sqlite'),
      registrar: { handle: (channel: string, handler: (event: unknown, raw: unknown) => unknown) => {
        handlers.set(channel, handler)
      }, removeHandler },
      support: ({ repositories }: { repositories: { projects: { get(id: string): Promise<unknown> } } }) => ({
        getWorkspace: async () => ({ status: 'EMPTY' }), getGitStatus: async () => ({ status: 'EMPTY' }),
        listProviderAccounts: async () => [], listSkillBindings: async () => ({ status: 'EMPTY' }),
        listMcpServers: async () => ({ status: 'EMPTY' }), listDiagnostics: async () => ({ status: 'EMPTY' })
      }) } as never)

    expect([...handlers]).toHaveLength(Object.keys(P15PublicIpcSchemas).length - 1)
    await expect(handlers.get('bs.v2.project.list')!({}, {})).resolves.toMatchObject({ projects: [] })
    await runtime.dispose()
    expect(handlers.size).toBe(0)
    expect(removeHandler).toHaveBeenCalledTimes(Object.keys(P15PublicIpcSchemas).length - 1)
  } finally {
    await runtime?.dispose()
    rmSync(dir, { recursive: true, force: true })
  }
})
