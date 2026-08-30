import { z } from 'zod'
import type { V2Repositories } from '../persistence/repositories'
import { stableImportId, summarize, type ImportResult } from './import-key'

const LegacyAgentSchema = z.object({
  legacyId: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  templateId: z.string().min(1),
  cwd: z.string().min(1),
  kind: z.enum(['pty', 'native']).optional(),
  mode: z.enum(['build', 'plan', 'coordinate']).optional()
})

export async function importAgents(
  values: readonly unknown[],
  repositories: Pick<V2Repositories,
    'projects' | 'agentDefinitions' | 'agentVersions' | 'importHistory'>,
  now: () => string = () => new Date().toISOString()
): Promise<ImportResult> {
  const results = []
  for (const value of values) {
    const legacy = LegacyAgentSchema.parse(value)
    if (!await repositories.projects.get(legacy.projectId)) {
      throw new Error(`unknown imported project: ${legacy.projectId}`)
    }
    const recordedId = await repositories.importHistory.get('v1:agent', legacy.legacyId)
    const id = recordedId ?? stableImportId('agent', legacy.legacyId)
    const existingDefinition = await repositories.agentDefinitions.get(id)
    const versionId = existingDefinition?.currentVersionId
      ?? stableImportId('agent-version', legacy.legacyId)
    const existingVersion = await repositories.agentVersions.get(versionId)
    const createdAt = existingDefinition?.createdAt ?? now()
    if (!existingDefinition || !existingDefinition.currentVersionId) {
      await repositories.agentDefinitions.save({
        id, projectId: legacy.projectId, name: legacy.name,
        role: legacy.mode === 'coordinate' ? 'COORDINATOR' : 'WORKER',
        currentVersionId: versionId, createdAt, updatedAt: createdAt
      })
    }
    if (!existingVersion) {
      await repositories.agentVersions.save({
        id: versionId, agentDefinitionId: id, revision: 1,
        systemInstructions: '', toolIds: [], skillIds: [], permissionProfile: {}, createdAt
      })
    }
    await repositories.importHistory.record('v1:agent', legacy.legacyId, id)
    results.push({ id, imported: !recordedId || !existingDefinition || !existingVersion })
  }
  return summarize(results)
}
