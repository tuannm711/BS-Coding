import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import type { ProviderAdapter } from '../../src/main/providers/types'
import type { LlmStreamPart } from '../../src/main/agent/llm'
import type { ProviderUsage } from '../../src/shared/types'

function fakeVault() {
  const secrets = new Map<string, string>()
  return {
    saveSecret: (ref: string, value: string) => { secrets.set(ref, value) },
    getSecret: (ref: string) => secrets.get(ref) ?? null,
    deleteSecret: (ref: string) => { secrets.delete(ref) }
  }
}

const usage = (): ProviderUsage => ({
  accountId: 'acct', refreshedAt: 1, source: 'provider', status: 'ok',
  quotaGroups: [
    { id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [] },
    { id: 'claude-gpt', label: 'Claude and GPT models', modelIds: [], windows: [] }
  ]
})

function makeManager(opts: { parts: (model: string) => LlmStreamPart[]; legacy?: boolean }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bs-poolerr-'))
  const accountsFile = path.join(dir, 'accounts.json')
  writeFileSync(accountsFile, JSON.stringify({
    version: 1,
    connections: [{ providerId: 'antigravity', activeAccountId: 'acct', accounts: [{
      id: 'acct', providerId: 'antigravity', label: 'a@example.com', authMode: 'oauth',
      status: 'active', createdAt: 1, lastUsedAt: 1, keyRef: 'account:acct',
      models: ['gemini-3.6-flash', 'claude-sonnet-4-6'],
      modelCatalog: [
        { id: 'gemini-3.6-flash', name: 'g', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } },
        { id: 'claude-sonnet-4-6', name: 'c', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }
      ],
      ...(opts.legacy ? {} : {}),
      usage: usage()
    }] }]
  }))
  const registry = new ProviderRegistry()
  const adapter = {
    capability: {
      id: 'antigravity', displayName: 'Antigravity', description: '', status: 'ready',
      chatTransport: 'cloud-code', methods: []
    },
    definition() { return adapter.capability },
    async connect() { throw new Error('unused') },
    async refreshAccount(account: unknown) { return account },
    async listModels() { return [] },
    quotaGroupForModel: (id: string) => id.includes('gemini') ? 'gemini' : 'claude-gpt',
    createRuntime(_a: unknown, _s: unknown, model: { id: string }) {
      return { async *stream() { for (const part of opts.parts(model.id)) yield part } }
    }
  } as unknown as ProviderAdapter
  registry.register(adapter)
  const vault = fakeVault()
  vault.saveSecret('account:acct', JSON.stringify({ accessToken: 't' }))
  const manager = new ProviderManager({ accountsFile, registry, vault: vault as never })
  return manager
}

const drain = async (manager: ProviderManager, model: string) => {
  const client = manager.createRuntime('antigravity', 'acct', model)
  for await (const _part of client.stream({ model, system: '', messages: [], tools: [] })) { /* consume */ }
}

const quotaError: LlmStreamPart[] = [
  { kind: 'error', error: '[bs] [request-failed] Antigravity request failed (429): Individual quota reached' }
]
const authError: LlmStreamPart[] = [
  { kind: 'error', error: '[bs] [request-failed] Antigravity request failed (401): Unauthorized' }
]
const ok: LlmStreamPart[] = [{ kind: 'text', text: 'hi' }, { kind: 'finish' }]

const accountOf = (manager: ProviderManager) => manager.list('antigravity')[0].accounts[0]

describe('pool-scoped provider errors', () => {
  it('records a quota error under the pool that was refused', async () => {
    const manager = makeManager({ parts: () => quotaError })
    await drain(manager, 'claude-sonnet-4-6')
    const account = accountOf(manager)
    expect(account.poolErrors?.['claude-gpt']?.kind).toBe('quota-exhausted')
    expect(account.poolErrors?.['gemini']).toBeUndefined()
  })

  it('clears only the pool that succeeded', async () => {
    const manager = makeManager({ parts: model => model.includes('gemini') ? ok : quotaError })
    await drain(manager, 'claude-sonnet-4-6')
    await drain(manager, 'gemini-3.6-flash')
    // A Gemini turn succeeding says nothing about Claude. Clearing it here would
    // make the next turn try Claude again and earn the same 429.
    expect(accountOf(manager).poolErrors?.['claude-gpt']?.kind).toBe('quota-exhausted')
  })

  it('still records an auth failure account-wide', async () => {
    const manager = makeManager({ parts: () => authError })
    await drain(manager, 'claude-sonnet-4-6')
    const account = accountOf(manager)
    expect(account.providerError?.kind).toBe('auth')
    expect(account.poolErrors).toBeUndefined()
  })

  it('reads an account stored without poolErrors unchanged', () => {
    // No migration: an older record must behave exactly as it does today.
    const manager = makeManager({ parts: () => ok, legacy: true })
    expect(accountOf(manager).poolErrors).toBeUndefined()
  })
})
