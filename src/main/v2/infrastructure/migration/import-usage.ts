import { z } from 'zod'
import type { UsageLedger } from '../../application/observability/usage-ledger'
import type { UsageRecord } from '../../../../shared/v2/contracts/usage'
import type { V2Repositories } from '../persistence/repositories'
import { stableImportId } from './import-key'

const count = z.number().int().nonnegative()
const epochMillis = z.number().nonnegative().max(8_640_000_000_000_000)
const TokensSchema = z.object({
  input: count, output: count, total: count,
  cacheRead: count.optional(), cacheWrite: count.optional()
})
const UsageSessionSchema = z.object({
  id: z.string().min(1), projectPath: z.string().min(1),
  usage: z.object({
    input: count, output: count, cacheRead: count, cacheWrite: count,
    cost: z.number().nonnegative().finite()
  }).optional(),
  items: z.array(z.unknown())
})
const UsageMessageSchema = z.object({
  kind: z.literal('message'),
  message: z.object({
    id: z.string().min(1), role: z.literal('assistant'), createdAt: epochMillis,
    tokens: TokensSchema,
    execution: z.object({
      providerId: z.string().min(1).optional(),
      accountId: z.string().min(1).optional(),
      modelId: z.string().min(1).optional()
    }).optional()
  })
})
const ProviderAccountUsageSchema = z.object({
  id: z.string().min(1), providerId: z.string().min(1),
  usage: z.object({
    status: z.enum(['ok', 'unavailable']),
    source: z.enum(['provider', 'internal', 'unavailable']),
    refreshedAt: epochMillis,
    primaryUsedPercent: z.number().min(0).max(100).optional(),
    resetAt: epochMillis.optional()
  }).optional()
})

export interface HistoricalUsageImportResult {
  importedUsage: number
  importedQuota: number
  skipped: number
  unattributed: number
}

interface HistoricalUsageDependencies {
  repositories: Pick<V2Repositories,
    'importHistory' | 'historicalQuotaSnapshots'>
  usage: UsageLedger
}

function iso(value: number): string {
  return new Date(value).toISOString()
}

export async function importHistoricalUsage(
  input: { sessions: readonly unknown[]; providerAccounts: readonly unknown[] },
  dependencies: HistoricalUsageDependencies
): Promise<HistoricalUsageImportResult> {
  let importedUsage = 0
  let importedQuota = 0
  let skipped = 0
  let unattributed = 0

  for (const value of input.sessions) {
    const session = UsageSessionSchema.parse(value)
    const projectId = await dependencies.repositories.importHistory.get('v1:project', session.projectPath)
    const workSessionId = await dependencies.repositories.importHistory.get('v1:session', session.id)
    const observed = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    for (const item of session.items) {
      const parsed = UsageMessageSchema.safeParse(item)
      if (!parsed.success) continue
      const message = parsed.data.message
      observed.input += message.tokens.input
      observed.output += message.tokens.output
      observed.cacheRead += message.tokens.cacheRead ?? 0
      observed.cacheWrite += message.tokens.cacheWrite ?? 0
      const execution = message.execution
      if (!projectId || !execution?.providerId || !execution.accountId) {
        unattributed += 1
        continue
      }
      const id = stableImportId('usage', `${session.id}:${message.id}`)
      const record: UsageRecord = {
        id, projectId, ...(workSessionId ? { workSessionId } : {}),
        providerId: execution.providerId, accountId: execution.accountId,
        ...(execution.modelId ? { modelId: execution.modelId } : {}), requests: 1,
        inputTokens: message.tokens.input, outputTokens: message.tokens.output,
        ...(message.tokens.cacheRead === undefined ? {} : { cacheReadTokens: message.tokens.cacheRead }),
        ...(message.tokens.cacheWrite === undefined ? {} : { cacheWriteTokens: message.tokens.cacheWrite }),
        occurredAt: iso(message.createdAt), source: 'v1-session', confidence: 'ATTRIBUTED'
      }
      if (await dependencies.usage.record(record)) importedUsage += 1
      else skipped += 1
      await dependencies.repositories.importHistory.record(
        'v1:usage', `${session.id}:${message.id}`, id
      )
    }
    if ((session.usage?.cost ?? 0) > 0) unattributed += 1
    if (session.usage && (
      session.usage.input !== observed.input || session.usage.output !== observed.output
      || session.usage.cacheRead !== observed.cacheRead
      || session.usage.cacheWrite !== observed.cacheWrite
    )) unattributed += 1
  }

  for (const value of input.providerAccounts) {
    const account = ProviderAccountUsageSchema.parse(value)
    if (!account.usage) continue
    const sourceKey = `${account.id}:${account.usage.refreshedAt}`
    const id = stableImportId('quota', sourceKey)
    if (await dependencies.repositories.historicalQuotaSnapshots.get(id)) {
      await dependencies.repositories.importHistory.record('v1:quota', sourceKey, id)
      skipped += 1
      continue
    }
    const capturedAt = iso(account.usage.refreshedAt)
    await dependencies.repositories.historicalQuotaSnapshots.save({
      id, providerId: account.providerId, accountId: account.id,
      status: account.usage.status === 'ok' ? 'AVAILABLE' : 'UNAVAILABLE',
      ...(account.usage.primaryUsedPercent === undefined ? {}
        : { remainingPercent: 100 - account.usage.primaryUsedPercent }),
      ...(account.usage.resetAt === undefined ? {} : { resetAt: iso(account.usage.resetAt) }),
      capturedAt, source: 'v1-provider',
      confidence: account.usage.source === 'provider' ? 'EXACT'
        : account.usage.source === 'internal' ? 'ATTRIBUTED' : 'UNKNOWN'
    })
    await dependencies.repositories.importHistory.record('v1:quota', sourceKey, id)
    importedQuota += 1
  }

  return { importedUsage, importedQuota, skipped, unattributed }
}
