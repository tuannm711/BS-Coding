import { describe, expect, it, vi } from 'vitest'
import { createServer, get } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createFixtureAdapter } from '../../src/main/providers/adapters/fixture'
import type { ProviderAdapter } from '../../src/main/providers/types'
import type { ProviderAuthorizationSession } from '../../src/shared/providers'
import { ProviderUsageLedger } from '../../src/main/connections/usage-ledger'

function fakeVault() {
  const secrets = new Map<string, string>()
  return { saveSecret: (ref: string, value: string) => secrets.set(ref, value), getSecret: (ref: string) => secrets.get(ref) ?? null, deleteSecret: (ref: string) => secrets.delete(ref) }
}

describe('ProviderManager adapter flow', () => {
  it('records one completed runtime response against the exact account, model and quota period', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-runtime-ledger-'))
    const ledger = new ProviderUsageLedger(path.join(dir, 'usage-ledger.json'))
    const adapter: ProviderAdapter = {
      capability: { id: 'tracked-runtime', displayName: 'Tracked runtime', status: 'ready', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { return [{ id: 'code', name: 'Code' }] },
      createRuntime() {
        return { async *stream() { yield { kind: 'finish', tokens: { input: 12, output: 3, total: 20, cacheRead: 4, cacheWrite: 1 } } } }
      }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({
      accountsFile: path.join(dir, 'accounts.json'), registry, vault: fakeVault() as never, usageLedger: ledger,
      priceFor: () => ({ input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 })
    })
    const resetAt = 1_800_000_000_000
    const account = manager.store.upsert({
      providerId: 'tracked-runtime', label: 'Second account', authMode: 'oauth', status: 'active',
      models: ['code'], modelCatalog: [{ id: 'code', name: 'Code' }],
      usage: {
        accountId: 'pending', refreshedAt: 1, source: 'provider', status: 'ok',
        quotaGroups: [{ id: 'weekly-family', label: 'Code', modelIds: ['code'], windows: [{ id: 'weekly', label: 'Weekly', kind: 'weekly', remainingPercent: 80, resetAt, windowMinutes: 10_080, usageKnown: true, source: 'provider' }] }]
      }
    }, { accessToken: 'token' })
    const beforeRevision = manager.getSnapshot().revision

    for await (const _part of manager.createRuntime('tracked-runtime', account.id, 'code').stream({ model: 'code', system: '', messages: [], tools: [] })) { /* consume */ }

    const tracked = ledger.active('tracked-runtime', account.id, 'code', { key: `weekly:${resetAt}`, start: resetAt - 10_080 * 60_000, end: resetAt })
    expect(tracked).toMatchObject({ requests: 1, tokensInput: 17, tokensCache: 5, tokensOutput: 3, estimatedBilled: 0.0000186 })
    expect(manager.getSnapshot().accounts.find(item => item.id === account.id)?.usage?.tracked).toEqual(tracked)
    expect(manager.getSnapshot().revision).toBe(beforeRevision + 1)
    expect(ledger.active('tracked-runtime', 'another-account', 'code', { key: `weekly:${resetAt}`, start: 0 })).toBeUndefined()
  })

  it('does not record requests for a failed runtime response', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-runtime-ledger-error-'))
    const ledger = new ProviderUsageLedger(path.join(dir, 'usage-ledger.json'))
    const adapter: ProviderAdapter = {
      capability: { id: 'failed-runtime', displayName: 'Failed runtime', status: 'ready', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { return [{ id: 'code', name: 'Code' }] },
      createRuntime() { return { async *stream() { yield { kind: 'error', error: 'provider failed (500)' } } } }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: fakeVault() as never, usageLedger: ledger })
    const account = manager.store.upsert({ providerId: 'failed-runtime', label: 'Failure', authMode: 'oauth', status: 'active', models: ['code'] }, { accessToken: 'token' })

    for await (const _part of manager.createRuntime('failed-runtime', account.id, 'code').stream({ model: 'code', system: '', messages: [], tools: [] })) { /* consume */ }

    expect(ledger.aggregateAccount('failed-runtime', account.id, { key: `local:${account.createdAt}`, start: account.createdAt })).toBeUndefined()
  })

  it('creates a link without opening it and completes through the adapter strategy', async () => {
    const opened: string[] = []
    const changes: ProviderAuthorizationSession[] = []
    const adapter: ProviderAdapter = {
      capability: {
        id: 'oauth-fixture',
        displayName: 'OAuth fixture',
        status: 'ready',
        methods: [{ id: 'oauth', label: 'OAuth', description: '', kind: 'oauth', fields: [] }]
      },
      authorization: {
        methodId: 'oauth',
        callback: { port: 0, path: '/callback', timeoutMs: 1_000 },
        build({ pkce, callbackUrl }) {
          const url = new URL('https://auth.example/authorize')
          url.searchParams.set('state', pkce.state)
          url.searchParams.set('callback_url', callbackUrl)
          return { authUrl: url.toString(), expectedState: pkce.state }
        },
        async complete() {
          return {
            account: { providerId: 'oauth-fixture', label: 'OAuth account', authMode: 'oauth', status: 'active' },
            secrets: { accessToken: 'oauth-token' }
          }
        }
      },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { return [{ id: 'fixture-code', name: 'Fixture Code' }] },
      createRuntime() { return { async *stream() { yield { kind: 'finish' } } } }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({
      accountsFile: path.join(mkdtempSync(path.join(tmpdir(), 'bs-auth-manager-')), 'accounts.json'),
      registry,
      vault: fakeVault() as never,
      openExternal: url => { opened.push(url) },
      onAuthorizationChanged: session => changes.push(session)
    })

    const session = await manager.createAuthorization({ providerId: 'oauth-fixture', methodId: 'oauth' })
    expect(session.status).toBe('waiting')
    expect(opened).toEqual([])

    await manager.openAuthorization(session.loginId)
    expect(opened).toEqual([session.authUrl])

    const auth = new URL(session.authUrl)
    const callbackUrl = auth.searchParams.get('callback_url')!
    const state = auth.searchParams.get('state')!
    get(`${callbackUrl}?code=oauth-code&state=${encodeURIComponent(state)}`).on('error', () => {})
    await vi.waitFor(() => expect(manager.getAuthorization(session.loginId)?.status).toBe('connected'))

    expect(manager.list('oauth-fixture')[0].accounts[0].models).toEqual(['fixture-code'])
    expect(changes.at(-1)?.status).toBe('connected')
    manager.close()
  })

  it('rolls back a new OAuth account when model hydration fails', async () => {
    const adapter: ProviderAdapter = {
      capability: {
        id: 'oauth-model-failure', displayName: 'OAuth model failure', status: 'ready',
        methods: [{ id: 'oauth', label: 'OAuth', description: '', kind: 'oauth', fields: [] }]
      },
      authorization: {
        methodId: 'oauth', callback: { port: 0, path: '/callback', timeoutMs: 1_000 },
        build({ pkce, callbackUrl }) {
          const url = new URL('https://auth.example/authorize')
          url.searchParams.set('state', pkce.state)
          url.searchParams.set('callback_url', callbackUrl)
          return { authUrl: url.toString(), expectedState: pkce.state }
        },
        async complete() {
          return {
            account: { providerId: 'oauth-model-failure', label: 'Partial', authMode: 'oauth', status: 'active' },
            secrets: { accessToken: 'token' }
          }
        }
      },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { throw new Error('model hydration failed') },
      createRuntime() { throw new Error('not used') }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({
      accountsFile: path.join(mkdtempSync(path.join(tmpdir(), 'bs-auth-rollback-')), 'accounts.json'),
      registry,
      vault: fakeVault() as never
    })

    const session = await manager.createAuthorization({ providerId: 'oauth-model-failure', methodId: 'oauth' })
    const auth = new URL(session.authUrl)
    get(`${auth.searchParams.get('callback_url')}?code=oauth-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`).on('error', () => {})
    await vi.waitFor(() => expect(manager.getAuthorization(session.loginId)?.status).toBe('error'))

    expect(manager.list('oauth-model-failure')).toEqual([])
    manager.close()
  })

  it('restores the previous OAuth account and secret when reconnect hydration fails', async () => {
    const adapter: ProviderAdapter = {
      capability: {
        id: 'oauth-reconnect-failure', displayName: 'OAuth reconnect failure', status: 'ready',
        methods: [{ id: 'oauth', label: 'OAuth', description: '', kind: 'oauth', fields: [] }]
      },
      authorization: {
        methodId: 'oauth', callback: { port: 0, path: '/callback', timeoutMs: 1_000 },
        build({ pkce, callbackUrl }) {
          const url = new URL('https://auth.example/authorize')
          url.searchParams.set('state', pkce.state)
          url.searchParams.set('callback_url', callbackUrl)
          return { authUrl: url.toString(), expectedState: pkce.state }
        },
        async complete() {
          return {
            account: { providerId: 'oauth-reconnect-failure', label: 'Replacement', authMode: 'oauth', status: 'active' },
            secrets: { accessToken: 'replacement-token' }
          }
        }
      },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { throw new Error('model hydration failed') },
      createRuntime() { throw new Error('not used') }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({
      accountsFile: path.join(mkdtempSync(path.join(tmpdir(), 'bs-auth-reconnect-rollback-')), 'accounts.json'),
      registry,
      vault: fakeVault() as never
    })
    const original = manager.store.upsert({
      providerId: 'oauth-reconnect-failure', label: 'Original', authMode: 'oauth', status: 'active',
      models: ['original-code'], modelCatalog: [{ id: 'original-code', name: 'Original Code' }]
    }, { accessToken: 'original-token', refreshToken: 'original-refresh' })

    const session = await manager.createAuthorization({
      providerId: 'oauth-reconnect-failure', methodId: 'oauth', reconnectAccountId: original.id
    })
    const auth = new URL(session.authUrl)
    get(`${auth.searchParams.get('callback_url')}?code=oauth-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`).on('error', () => {})
    await vi.waitFor(() => expect(manager.getAuthorization(session.loginId)?.status).toBe('error'))

    expect(manager.store.get(original.id)).toMatchObject({ label: 'Original', models: ['original-code'] })
    expect(manager.store.getSecret(original.id)).toMatchObject({ accessToken: 'original-token', refreshToken: 'original-refresh' })
    manager.close()
  })

  it('closes the callback listener when authorization link construction fails', async () => {
    const probe = await new Promise<{ port: number; close: () => Promise<void> }>((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') return reject(new Error('missing probe port'))
        resolve({ port: address.port, close: () => new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done())) })
      })
    })
    await probe.close()

    const adapter: ProviderAdapter = {
      capability: {
        id: 'oauth-build-failure', displayName: 'OAuth build failure', status: 'ready',
        methods: [{ id: 'oauth', label: 'OAuth', description: '', kind: 'oauth', fields: [] }]
      },
      authorization: {
        methodId: 'oauth', callback: { port: probe.port, path: '/callback', timeoutMs: 1_000 },
        build() { throw new Error('link construction failed') },
        async complete() { throw new Error('not used') }
      },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { return [] },
      createRuntime() { throw new Error('not used') }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({
      accountsFile: path.join(mkdtempSync(path.join(tmpdir(), 'bs-auth-build-rollback-')), 'accounts.json'),
      registry,
      vault: fakeVault() as never
    })

    await expect(manager.createAuthorization({ providerId: 'oauth-build-failure', methodId: 'oauth' }))
      .rejects.toThrow('link construction failed')

    await new Promise<void>((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(probe.port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()))
    })
    manager.close()
  })

  it('connects an account through a registered method', async () => {
    const registry = new ProviderRegistry()
    registry.register(createFixtureAdapter())
    const manager = new ProviderManager({ accountsFile: 'C:/tmp/bs-provider-test/accounts.json', registry, vault: fakeVault() as never })
    const result = await manager.connectMethod({ providerId: 'fixture', methodId: 'api-key', fields: { apiKey: 'fixture-secret', label: 'Local fixture' } })
    expect(result.accountId).toBeTruthy()
    expect(manager.list('fixture')[0].accounts[0].label).toBe('Local fixture')
  })

  it('increments the snapshot revision once for an account connection mutation', async () => {
    const registry = new ProviderRegistry()
    registry.register(createFixtureAdapter())
    const manager = new ProviderManager({ accountsFile: 'C:/tmp/bs-provider-revision-test/accounts.json', registry, vault: fakeVault() as never })
    const before = manager.getSnapshot().revision

    await manager.connectMethod({ providerId: 'fixture', methodId: 'api-key', fields: { apiKey: 'fixture-secret', label: 'Revision fixture' } })

    expect(manager.getSnapshot().revision).toBe(before + 1)
  })

  it('reconnects the selected account in place instead of adding another account', async () => {
    const registry = new ProviderRegistry()
    registry.register(createFixtureAdapter())
    const manager = new ProviderManager({ accountsFile: 'C:/tmp/bs-provider-reconnect/accounts.json', registry, vault: fakeVault() as never })
    const first = await manager.connectMethod({ providerId: 'fixture', methodId: 'api-key', fields: { apiKey: 'old-secret', label: 'Original' } })
    const accountCount = manager.list('fixture')[0].accounts.length

    const reconnected = await manager.connectMethod({ providerId: 'fixture', methodId: 'api-key', reconnectAccountId: first.accountId, fields: { apiKey: 'new-secret', label: 'Reconnected' } })

    expect(reconnected.accountId).toBe(first.accountId)
    expect(manager.list('fixture')[0].accounts).toHaveLength(accountCount)
    expect(manager.store.get(first.accountId!)).toMatchObject({ id: first.accountId, label: 'Reconnected' })
    expect(manager.store.getSecret(first.accountId!)).toMatchObject({ apiKey: 'new-secret' })
  })

  it('persists rotated credentials before creating an OAuth runtime', async () => {
    const seenTokens: string[] = []
    const adapter: ProviderAdapter = {
      capability: { id: 'oauth-runtime', displayName: 'OAuth runtime', status: 'ready', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async refreshCredentials(_account, secret) { return { ...secret, accessToken: 'rotated', expiresAt: Date.now() + 3_600_000 } },
      async listModels() { return [{ id: 'code', name: 'Code' }] },
      createRuntime(_account, secret) {
        seenTokens.push(secret.accessToken ?? '')
        return { async *stream() { yield { kind: 'finish' } } }
      }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({ accountsFile: 'C:/tmp/bs-provider-runtime-refresh/accounts.json', registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'oauth-runtime', label: 'OAuth', authMode: 'oauth', status: 'active', models: ['code'], modelCatalog: [{ id: 'code', name: 'Code' }] }, { accessToken: 'expired', refreshToken: 'refresh', expiresAt: 1 })

    const runtime = manager.createRuntime('oauth-runtime', account.id, 'code')
    for await (const _part of runtime.stream({ model: 'code', system: '', messages: [], tools: [] })) { /* consume */ }

    expect(seenTokens).toEqual(['rotated'])
    expect(manager.store.getSecret(account.id)).toMatchObject({ accessToken: 'rotated' })
  })

  it('refreshes once after a runtime auth failure and persists the rotated token', async () => {
    const runtimeTokens: string[] = []
    const adapter: ProviderAdapter = {
      capability: { id: 'oauth-retry', displayName: 'OAuth retry', status: 'ready', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async refreshCredentials(_account, secret, options) { return options?.force ? { ...secret, accessToken: 'rotated' } : secret },
      async listModels() { return [{ id: 'code', name: 'Code' }] },
      createRuntime(_account, secret) {
        runtimeTokens.push(secret.accessToken ?? '')
        return { async *stream() { if (secret.accessToken === 'expired') yield { kind: 'error', error: '[bs] request failed (401): token expired' }; else yield { kind: 'finish' } } }
      }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({ accountsFile: 'C:/tmp/bs-provider-runtime-401/accounts.json', registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'oauth-retry', label: 'OAuth', authMode: 'oauth', status: 'active', models: ['code'], modelCatalog: [{ id: 'code', name: 'Code' }] }, { accessToken: 'expired', refreshToken: 'refresh' })

    const parts = []
    for await (const part of manager.createRuntime('oauth-retry', account.id, 'code').stream({ model: 'code', system: '', messages: [], tools: [] })) parts.push(part)

    expect(runtimeTokens).toEqual(['expired', 'rotated'])
    expect(parts).toEqual([{ kind: 'finish' }])
    expect(manager.store.getSecret(account.id)).toMatchObject({ accessToken: 'rotated' })
  })

  it('persists structured runtime capacity errors and retry windows in the snapshot', async () => {
    let fail = true
    const adapter: ProviderAdapter = {
      capability: { id: 'runtime-error', displayName: 'Runtime error', status: 'ready', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { return [{ id: 'code', name: 'Code' }] },
      createRuntime() { return { async *stream() { if (fail) yield { kind: 'error', error: '[bs] request failed (429): MODEL_CAPACITY_EXHAUSTED; retry-after=120' }; else yield { kind: 'finish' } } } }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({ accountsFile: 'C:/tmp/bs-provider-runtime-error/accounts.json', registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'runtime-error', label: 'OAuth', authMode: 'oauth', status: 'active', models: ['code'], modelCatalog: [{ id: 'code', name: 'Code' }] }, { accessToken: 'token' })
    const before = Date.now()

    for await (const _part of manager.createRuntime('runtime-error', account.id, 'code').stream({ model: 'code', system: '', messages: [], tools: [] })) { /* consume */ }

    const snapshotAccount = manager.getSnapshot().accounts.find(item => item.id === account.id)
    expect(snapshotAccount?.error).toMatchObject({ kind: 'capacity-exhausted', statusCode: 429 })
    expect(snapshotAccount?.error?.retryAt).toBeGreaterThanOrEqual(before + 119_000)

    fail = false
    for await (const _part of manager.createRuntime('runtime-error', account.id, 'code').stream({ model: 'code', system: '', messages: [], tools: [] })) { /* consume */ }
    expect(manager.getSnapshot().accounts.find(item => item.id === account.id)?.error).toBeUndefined()
  })

  it('persists credentials rotated by a usage adapter', async () => {
    const adapter: ProviderAdapter = {
      capability: { id: 'usage-refresh', displayName: 'Usage refresh', status: 'ready', methods: [] },
      definition() { return this.capability },
      async connect() { throw new Error('not used') },
      async refreshAccount(account) { return account },
      async listModels() { return [] },
      createRuntime() { throw new Error('not used') },
      async fetchUsage(account, secret) {
        secret.accessToken = 'usage-rotated'
        return { accountId: account.id, refreshedAt: Date.now(), source: 'provider', status: 'ok' }
      }
    }
    const registry = new ProviderRegistry()
    registry.register(adapter)
    const manager = new ProviderManager({ accountsFile: 'C:/tmp/bs-provider-usage-rotation/accounts.json', registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'usage-refresh', label: 'OAuth', authMode: 'oauth', status: 'active' }, { accessToken: 'old', refreshToken: 'refresh' })

    await manager.refreshUsage('usage-refresh', account.id)

    expect(manager.store.getSecret(account.id)).toMatchObject({ accessToken: 'usage-rotated' })
  })
})
