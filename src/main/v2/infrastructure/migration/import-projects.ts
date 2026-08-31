import { z } from 'zod'
import type { V2Repositories } from '../persistence/repositories'
import { importOnce, summarize, type ImportResult } from './import-key'

const LegacyProjectSchema = z.object({
  legacyId: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1),
  defaultBranch: z.string().min(1).optional(),
  instructionsRef: z.string().min(1).optional()
})

export async function importProjects(
  values: readonly unknown[],
  repositories: Pick<V2Repositories, 'projects' | 'importHistory'>,
  now: () => string = () => new Date().toISOString()
): Promise<ImportResult> {
  const results = []
  for (const value of values) {
    const legacy = LegacyProjectSchema.parse(value)
    const createdAt = now()
    const result = await importOnce({
      sourceType: 'v1:project', sourceKey: legacy.legacyId, entity: 'project',
      repository: repositories.projects, history: repositories.importHistory,
      create: id => ({
        id, name: legacy.name, repoPath: legacy.path,
        defaultBranch: legacy.defaultBranch ?? 'master',
        instructionsRef: legacy.instructionsRef ?? 'AGENTS.md',
        createdAt, updatedAt: createdAt
      })
    })
    results.push(result)
  }
  return summarize(results)
}
