import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ProviderTrackedUsage } from '../../shared/types'

export interface UsageLedgerRecord {
  providerId: string
  accountId: string
  modelId: string
  quotaGroupId?: string
  timestamp: number
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
  estimatedCost: number
}

export interface UsagePeriod {
  key: string
  start: number
  end?: number
}

interface LedgerIdentity {
  providerId: string
  accountId: string
  modelId: string
  quotaGroupId?: string
  periods: ProviderTrackedUsage[]
}

interface LedgerFile {
  version: 1
  records: Record<string, LedgerIdentity>
}

const EMPTY_LEDGER: LedgerFile = { version: 1, records: {} }

export class ProviderUsageLedger {
  private state: LedgerFile

  constructor(private readonly file: string, private readonly maxPeriods = 12) {
    this.state = this.load()
  }

  record(input: UsageLedgerRecord, period: UsagePeriod): ProviderTrackedUsage {
    const key = identityKey(input.providerId, input.accountId, input.modelId, input.quotaGroupId)
    const identity = this.state.records[key] ?? {
      providerId: input.providerId,
      accountId: input.accountId,
      modelId: input.modelId,
      quotaGroupId: input.quotaGroupId,
      periods: []
    }
    const current = identity.periods.find(item => item.periodKey === period.key) ?? emptyUsage(period)
    const cache = nonNegative(input.tokens.cacheRead) + nonNegative(input.tokens.cacheWrite)
    const next: ProviderTrackedUsage = {
      ...current,
      requests: current.requests + 1,
      tokensInput: current.tokensInput + nonNegative(input.tokens.input) + cache,
      tokensCache: current.tokensCache + cache,
      tokensOutput: current.tokensOutput + nonNegative(input.tokens.output),
      estimatedBilled: roundMoney(current.estimatedBilled + nonNegative(input.estimatedCost))
    }
    identity.periods = [...identity.periods.filter(item => item.periodKey !== period.key), next]
      .sort((a, b) => a.periodStart - b.periodStart)
      .slice(-Math.max(1, this.maxPeriods))
    this.state.records[key] = identity
    this.save()
    return { ...next }
  }

  active(providerId: string, accountId: string, modelId: string, period: UsagePeriod): ProviderTrackedUsage | undefined {
    const identity = this.state.records[identityKey(providerId, accountId, modelId)]
      ?? Object.values(this.state.records).find(item => item.providerId === providerId && item.accountId === accountId && item.modelId === modelId)
    const found = identity?.periods.find(item => item.periodKey === period.key)
    return found ? { ...found } : undefined
  }

  aggregateAccount(providerId: string, accountId: string, period: UsagePeriod, modelIds?: string[]): ProviderTrackedUsage | undefined {
    const allowed = modelIds ? new Set(modelIds) : undefined
    const matching = Object.values(this.state.records)
      .filter(item => item.providerId === providerId && item.accountId === accountId && (!allowed || allowed.has(item.modelId)))
      .flatMap(item => item.periods.filter(candidate => candidate.periodKey === period.key))
    if (matching.length === 0) return undefined
    return matching.reduce<ProviderTrackedUsage>((total, item) => ({
      ...total,
      requests: total.requests + item.requests,
      tokensInput: total.tokensInput + item.tokensInput,
      tokensCache: total.tokensCache + item.tokensCache,
      tokensOutput: total.tokensOutput + item.tokensOutput,
      estimatedBilled: roundMoney(total.estimatedBilled + item.estimatedBilled)
    }), emptyUsage(period))
  }

  private load(): LedgerFile {
    if (!existsSync(this.file)) return { ...EMPTY_LEDGER, records: {} }
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<LedgerFile>
      if (parsed.version !== 1 || !parsed.records || typeof parsed.records !== 'object') return { ...EMPTY_LEDGER, records: {} }
      return { version: 1, records: parsed.records }
    } catch {
      return { ...EMPTY_LEDGER, records: {} }
    }
  }

  private save(): void {
    mkdirSync(path.dirname(this.file), { recursive: true })
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(temp, JSON.stringify(this.state, null, 2))
    renameSync(temp, this.file)
  }
}

function identityKey(providerId: string, accountId: string, modelId: string, quotaGroupId?: string): string {
  return [providerId, accountId, modelId, quotaGroupId ?? ''].map(encodeURIComponent).join('|')
}

function emptyUsage(period: UsagePeriod): ProviderTrackedUsage {
  return {
    periodKey: period.key,
    periodStart: period.start,
    ...(period.end === undefined ? {} : { periodEnd: period.end }),
    requests: 0,
    tokensInput: 0,
    tokensCache: 0,
    tokensOutput: 0,
    estimatedBilled: 0,
    source: 'bs-tracked'
  }
}

function nonNegative(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, value)
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000
}
