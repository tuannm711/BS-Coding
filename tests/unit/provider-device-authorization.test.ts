import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createGitHubCopilotAdapter } from '../../src/main/providers/adapters/github-copilot'

const roots: string[] = []
const managers: ProviderManager[] = []
afterEach(() => { managers.forEach(m => m.close()); managers.length = 0; roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

const completed = { account: { providerId: 'github-copilot', label: 'Octo', authMode: 'oauth' as const, status: 'active' as const }, secrets: { accessToken: 'runtime-token', githubAccessToken: 'identity-token' } }

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-device-manager-'))
  roots.push(root)
  const adapter = createGitHubCopilotAdapter()
  const completion = deferred<typeof completed>()
  const closed = vi.fn()
  adapter.authorization = { kind: 'device', methodId: 'oauth', async start({ signal }) {
    signal.addEventListener('abort', closed, { once: true })
    return { authUrl: 'https://github.com/login/device', userCode: 'ABCD-EFGH', expiresAt: Date.now() + 900_000, complete: () => completion.promise }
  } }
  const registry = new ProviderRegistry()
  registry.register(adapter)
  const values = new Map<string, string>()
  const vault = { saveSecret: (key: string, value: string) => values.set(key, value), getSecret: (key: string) => values.get(key), deleteSecret: (key: string) => values.delete(key) }
  const manager = new ProviderManager({ accountsFile: path.join(root, 'accounts.json'), registry, vault: vault as never })
  managers.push(manager)
  return { manager, adapter, completion, closed }
}

describe('device authorization persistence', () => {
  it('exposes only the user code and ignores completion after Cancel', async () => {
    const f = fixture()
    const session = await f.manager.createAuthorization({ providerId: 'github-copilot', methodId: 'oauth' })
    expect(session.userCode).toBe('ABCD-EFGH')
    expect(JSON.stringify(session)).not.toMatch(/device_code|runtime-token|identity-token/)
    f.manager.cancelAuthorization(session.loginId)
    f.completion.resolve(completed)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(f.closed).toHaveBeenCalledTimes(1)
    expect(f.manager.list()).toEqual([])
    expect(f.manager.getAuthorization(session.loginId)?.status).toBe('cancelled')
  })

  it('restores the original account and secrets when reconnect is cancelled during model loading', async () => {
    const f = fixture()
    const original = f.manager.store.upsert({ ...completed.account, id: 'existing', label: 'Original' }, { accessToken: 'original-token' })
    const models = deferred<[]>()
    const listing = vi.spyOn(f.adapter, 'listModels').mockImplementation(() => models.promise)
    const session = await f.manager.createAuthorization({ providerId: 'github-copilot', methodId: 'oauth', reconnectAccountId: original.id })
    f.completion.resolve(completed)
    await vi.waitFor(() => expect(listing).toHaveBeenCalled())
    f.manager.cancelAuthorization(session.loginId)
    models.resolve([])
    await vi.waitFor(() => expect(f.manager.store.get(original.id)?.label).toBe('Original'))
    expect(f.manager.store.getSecret(original.id)).toEqual({ accessToken: 'original-token' })
    expect(f.manager.list()[0].accounts).toHaveLength(1)
  })

  it('does not start a new login if the app closes while obtaining the device grant', async () => {
    const f = fixture()
    const start = deferred<{ authUrl: string; userCode: string; expiresAt: number; complete: () => Promise<typeof completed> }>()
    f.adapter.authorization = { kind: 'device', methodId: 'oauth', start: async () => start.promise }
    const pending = f.manager.createAuthorization({ providerId: 'github-copilot', methodId: 'oauth' })
    const assertion = expect(pending).rejects.toThrow(/closed|abort/i)
    f.manager.close()
    start.resolve({ authUrl: 'https://github.com/login/device', userCode: 'ABCD', expiresAt: Date.now() + 900_000, complete: () => f.completion.promise })
    await assertion
  })
})
