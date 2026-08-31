import { z } from 'zod'
import type { V2Repositories } from '../persistence/repositories'
import { importOnce, summarize, type ImportResult } from './import-key'

const LegacyProviderAccountSchema = z.object({
  legacyId: z.string().min(1),
  providerId: z.string().min(1),
  label: z.string().min(1),
  authMode: z.enum(['api-key', 'oauth', 'imported']),
  status: z.enum(['active', 'disabled', 'expired', 'error']),
  createdAt: z.number().nonnegative(),
  lastUsedAt: z.number().nonnegative(),
  keyRef: z.string().min(1).optional()
})

const status = {
  active: 'HEALTHY', disabled: 'UNKNOWN', expired: 'EXPIRED', error: 'ERROR'
} as const

export async function importProviders(
  values: readonly unknown[],
  repositories: Pick<V2Repositories, 'providerAccounts' | 'importHistory'>,
  now: () => string = () => new Date().toISOString()
): Promise<ImportResult> {
  const results = []
  for (const value of values) {
    const legacy = LegacyProviderAccountSchema.parse(value)
    const result = await importOnce({
      sourceType: 'v1:provider-account', sourceKey: legacy.legacyId,
      entity: 'provider-account', repository: repositories.providerAccounts,
      history: repositories.importHistory,
      create: id => ({
        id, providerId: legacy.providerId, label: legacy.label, authMode: legacy.authMode,
        status: status[legacy.status], enabled: legacy.status !== 'disabled',
        ...(legacy.keyRef ? { vaultRef: legacy.keyRef } : {}),
        createdAt: new Date(legacy.createdAt).toISOString(),
        lastUsedAt: new Date(legacy.lastUsedAt).toISOString(), updatedAt: now()
      })
    })
    results.push(result)
  }
  return summarize(results)
}
