import { createHash } from 'node:crypto'
import type { ImportHistoryRepository, Repository } from '../persistence/repositories'

export interface ImportResult {
  imported: number
  skipped: number
  importedIds: string[]
}

export function stableImportId(entity: string, sourceKey: string): string {
  const digest = createHash('sha256').update(`v1:${entity}\0${sourceKey}`).digest('hex').slice(0, 24)
  return `${entity}-${digest}`
}

export async function importOnce<T extends { id: string }>(input: {
  sourceType: string
  sourceKey: string
  entity: string
  repository: Repository<T>
  history: ImportHistoryRepository
  create(id: string): T
}): Promise<{ id: string; imported: boolean }> {
  const recordedId = await input.history.get(input.sourceType, input.sourceKey)
  const id = recordedId ?? stableImportId(input.entity, input.sourceKey)
  if (await input.repository.get(id)) {
    if (!recordedId) await input.history.record(input.sourceType, input.sourceKey, id)
    return { id, imported: false }
  }
  await input.repository.save(input.create(id))
  await input.history.record(input.sourceType, input.sourceKey, id)
  return { id, imported: true }
}

export function summarize(results: readonly { id: string; imported: boolean }[]): ImportResult {
  const imported = results.filter(result => result.imported).length
  return { imported, skipped: results.length - imported, importedIds: results.map(result => result.id) }
}
