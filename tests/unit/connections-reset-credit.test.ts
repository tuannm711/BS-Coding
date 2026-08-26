import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import type { ProviderAdapter } from '../../src/main/providers/types'
import type { ProviderUsage } from '../../src/shared/types'

function fakeVault() {
  const secrets = new Map<string, string>()
  return {
    saveSecret: (ref: string, value: string) => { secrets.set(ref, value) },
    getSecret: (ref: string) => secrets.get(ref) ?? null,
    deleteSecret: (ref: string) => { secrets.delete(ref) }
  }
}

const weeklyUsage = (accountId: string, remainingPercent: number, available: number): ProviderUsage => ({
  accountId, refreshedAt: 1, source: 'provider', status: 'ok',
  resetCredits: { available, applicable: 0 },
  quotaGroups: [{
    id: 'openai-base', label: 'Codex', modelIds: [],
    windows: [{ id: 'secondary', label: 'Weekly', kind: 'weekly', remainingPercent, usageKnown: true, source: 'provider' }]
  }]
})

function makeManager(opts: {
  weeklyRemaining: number
  available: number
  consume?: ProviderAdapter['consumeResetCredit']
  refreshThrows?: boolean
}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bs-reset-'))
  const registry = new ProviderRegistry()
  const adapter = {
    capability: {
      id: 'openai', displayName: 'OpenAI', description: '', status: 'ready',
      chatTransport: 'openai-responses', methods: []
    },
    definition() { return adapter.capability },
    async connect() { throw new Error('unused') },
    async refreshAccount(account: unknown) { return account },
    async listModels() { return [] },
    createRuntime() { throw new Error('unused') },
    async fetchUsage(): Promise<ProviderUsage> {
      if (opts.refreshThrows) throw new Error('refresh exploded')
      return weeklyUsage('placeholder', opts.weeklyRemaining, opts.available)
    },
    consumeResetCredit: opts.consume
  } as unknown as ProviderAdapter
  registry.register(adapter)
  // Seed the store on disk rather than reaching through the manager's private
  // field: the file is the real interface and needs no cast.
  const accountsFile = path.join(dir, 'accounts.json')
  const accountId = 'account-1'
  writeFileSync(accountsFile, JSON.stringify({
    version: 1,
    connections: [{
      providerId: 'openai', activeAccountId: accountId,
      accounts: [{
        id: accountId, providerId: 'openai', label: 'Work', authMode: 'oauth',
        status: 'active', createdAt: 1, lastUsedAt: 1, keyRef: `account:${accountId}`,
        usage: weeklyUsage(accountId, opts.weeklyRemaining, opts.available)
      }]
    }]
  }))
  const vault = fakeVault()
  vault.saveSecret(`account:${accountId}`, JSON.stringify({ accessToken: 't', refreshToken: 'r' }))
  const manager = new ProviderManager({ accountsFile, registry, vault: vault as never })
  return { manager, accountId }
}

describe('consumeResetCredit', () => {
  it('refuses without calling the adapter when the gate says no', async () => {
    // The gate lives here, not only on the button. A disabled button is a
    // courtesy; the channel can be called regardless and this cannot be undone.
    const consume = vi.fn(async () => {})
    const { manager, accountId } = makeManager({ weeklyRemaining: 69, available: 1, consume })
    const result = await manager.consumeResetCredit('openai', accountId)
    expect(result.status).toBe('refused')
    expect(consume).not.toHaveBeenCalled()
  })

  it('refuses when no credit is held', async () => {
    const consume = vi.fn(async () => {})
    const { manager, accountId } = makeManager({ weeklyRemaining: 2, available: 0, consume })
    expect((await manager.consumeResetCredit('openai', accountId)).status).toBe('refused')
    expect(consume).not.toHaveBeenCalled()
  })

  it('consumes and refreshes when the gate admits', async () => {
    const consume = vi.fn(async () => {})
    const { manager, accountId } = makeManager({ weeklyRemaining: 2, available: 1, consume })
    expect((await manager.consumeResetCredit('openai', accountId)).status).toBe('consumed')
    expect(consume).toHaveBeenCalledOnce()
  })

  it('reports a consumed credit even when the refresh afterwards fails', async () => {
    // The credit is gone either way. Reporting this as a failure would tell the
    // user to try again, which would spend another.
    const { manager, accountId } = makeManager({ weeklyRemaining: 2, available: 1, consume: async () => {}, refreshThrows: true })
    const result = await manager.consumeResetCredit('openai', accountId)
    expect(result.status).toBe('consumed')
    expect(result.status === 'consumed' && result.refreshError).toBeTruthy()
  })

  it('reports a failed post as failed', async () => {
    const { manager, accountId } = makeManager({
      weeklyRemaining: 2, available: 1,
      consume: async () => { throw new Error('refused by provider') }
    })
    const result = await manager.consumeResetCredit('openai', accountId)
    expect(result.status).toBe('failed')
  })
})
