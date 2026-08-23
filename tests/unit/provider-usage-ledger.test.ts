import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProviderUsageLedger, type UsagePeriod } from '../../src/main/connections/usage-ledger'

const dirs: string[] = []

function ledgerFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'bs-usage-ledger-'))
  dirs.push(dir)
  return path.join(dir, 'connections', 'usage-ledger.json')
}

function period(key: string, start: number, end?: number): UsagePeriod {
  return { key, start, ...(end === undefined ? {} : { end }) }
}

describe('ProviderUsageLedger', () => {
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('attributes successful usage to the exact provider account and model', () => {
    const file = ledgerFile()
    const ledger = new ProviderUsageLedger(file)
    const weekly = period('weekly:1800000000000', 1_799_395_200_000, 1_800_000_000_000)

    ledger.record({
      providerId: 'openai', accountId: 'acct-2', modelId: 'gpt-5.6-codex', quotaGroupId: 'openai-base', timestamp: 1_799_500_000_000,
      tokens: { input: 100, output: 20, cacheRead: 30, cacheWrite: 5 }, estimatedCost: 0.04
    }, weekly)

    expect(ledger.active('openai', 'acct-2', 'gpt-5.6-codex', weekly)).toEqual({
      periodKey: weekly.key, periodStart: weekly.start, periodEnd: weekly.end,
      requests: 1, tokensInput: 135, tokensCache: 35, tokensOutput: 20,
      estimatedBilled: 0.04, source: 'bs-tracked'
    })
    expect(ledger.active('openai', 'acct-1', 'gpt-5.6-codex', weekly)).toBeUndefined()
    expect(ledger.active('openai', 'acct-2', 'gpt-5.5-codex', weekly)).toBeUndefined()
  })

  it('persists account aggregates and reconstructs them after restart', () => {
    const file = ledgerFile()
    const weekly = period('weekly:1800000000000', 1_799_395_200_000, 1_800_000_000_000)
    const ledger = new ProviderUsageLedger(file)
    ledger.record({ providerId: 'openai', accountId: 'acct', modelId: 'gpt-a', timestamp: weekly.start, tokens: { input: 10, output: 2 }, estimatedCost: 0.01 }, weekly)
    ledger.record({ providerId: 'openai', accountId: 'acct', modelId: 'gpt-b', timestamp: weekly.start + 1, tokens: { input: 20, output: 3, cacheRead: 4 }, estimatedCost: 0.02 }, weekly)

    const restarted = new ProviderUsageLedger(file)
    expect(restarted.aggregateAccount('openai', 'acct', weekly)).toEqual({
      periodKey: weekly.key, periodStart: weekly.start, periodEnd: weekly.end,
      requests: 2, tokensInput: 34, tokensCache: 4, tokensOutput: 5,
      estimatedBilled: 0.03, source: 'bs-tracked'
    })
  })

  it('rolls over reset boundaries and retains bounded history per model', () => {
    const file = ledgerFile()
    const ledger = new ProviderUsageLedger(file, 2)
    for (let index = 1; index <= 3; index++) {
      const current = period(`weekly:${index}`, index * 100, index * 100 + 99)
      ledger.record({ providerId: 'antigravity', accountId: 'acct', modelId: 'gemini', timestamp: current.start, tokens: { input: index, output: index }, estimatedCost: index }, current)
    }

    const stored = JSON.parse(readFileSync(file, 'utf8')) as { records: Record<string, { periods: Array<{ periodKey: string }> }> }
    expect(Object.values(stored.records)[0].periods.map(item => item.periodKey)).toEqual(['weekly:2', 'weekly:3'])
    expect(ledger.active('antigravity', 'acct', 'gemini', period('weekly:1', 100, 199))).toBeUndefined()
    expect(ledger.active('antigravity', 'acct', 'gemini', period('weekly:3', 300, 399))?.requests).toBe(1)
  })

  it('does not delete a corrupt ledger before a new valid record is written', () => {
    const file = ledgerFile()
    const parent = path.dirname(file)
    const seed = new ProviderUsageLedger(file)
    seed.record({ providerId: 'p', accountId: 'a', modelId: 'm', timestamp: 1, tokens: { input: 1, output: 1 }, estimatedCost: 0 }, period('first', 1))
    writeFileSync(file, '{broken', 'utf8')

    const ledger = new ProviderUsageLedger(file)

    expect(readFileSync(file, 'utf8')).toBe('{broken')
    expect(ledger.active('p', 'a', 'm', period('first', 1))).toBeUndefined()
    expect(parent).toBe(path.dirname(file))
  })
})
