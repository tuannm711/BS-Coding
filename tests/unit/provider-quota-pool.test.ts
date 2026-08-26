import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { ProviderUsageLedger } from '../../src/main/connections/usage-ledger'
import type { ProviderAdapter } from '../../src/main/providers/types'
import type { ProviderUsage } from '../../src/shared/types'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'

describe('quotaGroupForModel', () => {
  it('classifies the model ids the ledger actually holds', () => {
    const pool = createAntigravityAdapter().quotaGroupForModel!
    expect(pool('gemini-3.6-flash')).toBe('gemini')
    expect(pool('claude-opus-4-5')).toBe('claude-gpt')
    expect(pool('claude-sonnet-4-6')).toBe('claude-gpt')
  })

  it('returns undefined rather than guessing for a model it cannot place', () => {
    // A default here would silently attribute a future model's usage to the
    // wrong pool, and route around the wrong one.
    expect(createAntigravityAdapter().quotaGroupForModel!('something-new')).toBeUndefined()
  })

  it('names the single OpenAI pool', () => {
    expect(createOpenAiAdapter().quotaGroupForModel!('gpt-5.6-sol')).toBe('openai-base')
  })
})

describe('ledger attribution', () => {
  function fakeVault() {
    const secrets = new Map<string, string>()
    return {
      saveSecret: (ref: string, value: string) => { secrets.set(ref, value) },
      getSecret: (ref: string) => secrets.get(ref) ?? null,
      deleteSecret: (ref: string) => { secrets.delete(ref) }
    }
  }

  it('attributes usage to a pool even when quotaGroups carry no model ids', () => {
    // The shape the owner's stored data is in: two groups, modelIds empty on
    // both, which is why every Antigravity ledger row before this had no pool.
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-pool-'))
    const accountsFile = path.join(dir, 'accounts.json')
    const usage: ProviderUsage = {
      accountId: 'acct', refreshedAt: 1, source: 'provider', status: 'ok',
      quotaGroups: [
        { id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [] },
        { id: 'claude-gpt', label: 'Claude and GPT models', modelIds: [], windows: [] }
      ]
    }
    writeFileSync(accountsFile, JSON.stringify({
      version: 1,
      connections: [{ providerId: 'antigravity', activeAccountId: 'acct', accounts: [{
        id: 'acct', providerId: 'antigravity', label: 'a@example.com', authMode: 'oauth',
        status: 'active', createdAt: 1, lastUsedAt: 1, usage
      }] }]
    }))
    const registry = new ProviderRegistry()
    registry.register(createAntigravityAdapter())
    const ledger = new ProviderUsageLedger(path.join(dir, 'ledger.json'))
    const manager = new ProviderManager({ accountsFile, registry, vault: fakeVault() as never, usageLedger: ledger })
    const record = manager as unknown as { recordRuntimeUsage: (p: string, a: string, m: string, t: unknown) => void }
    record.recordRuntimeUsage('antigravity', 'acct', 'claude-sonnet-4-6', { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 })
    // Read the file the ledger writes rather than its private field: the
    // file is the real interface and needs no cast.
    const stored = JSON.parse(readFileSync(path.join(dir, 'ledger.json'), 'utf8')) as {
      records: Record<string, { quotaGroupId?: string }>
    }
    expect(Object.values(stored.records).map(row => row.quotaGroupId)).toContain('claude-gpt')
  })
})
