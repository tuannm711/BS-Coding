import type { SkillDefinition, SkillSnapshot, SkillSource } from '../../../../shared/v2/contracts/skills'
import { SkillDefinitionSchema, SkillSnapshotSchema } from '../../../../shared/v2/schemas/extensions'

const sourceRank: Record<SkillSource, number> = {
  BUILTIN: 1,
  MARKETPLACE: 2,
  USER: 3,
  PROJECT: 4
}

function freezeDefinition(skill: SkillDefinition): SkillDefinition {
  return Object.freeze({
    ...skill,
    requiredToolNames: Object.freeze([...skill.requiredToolNames]),
    requiredMcpCapabilities: Object.freeze([...skill.requiredMcpCapabilities])
  })
}

export function resolveSkills(discovered: readonly unknown[]): readonly SkillDefinition[] {
  const validated = discovered.map(input =>
    freezeDefinition(SkillDefinitionSchema.parse(input) as SkillDefinition))
  const selected = new Map<string, SkillDefinition>()

  for (const candidate of validated) {
    const current = selected.get(candidate.name)
    if (!current || sourceRank[candidate.source] > sourceRank[current.source]) {
      selected.set(candidate.name, candidate)
      continue
    }
    if (sourceRank[candidate.source] === sourceRank[current.source]) {
      throw new Error(`ambiguous skill ${candidate.name} at ${candidate.source} precedence`)
    }
  }

  return Object.freeze([...selected.values()].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
}

export function createSkillResolver(deps: {
  hashContent(content: string): string
  saveContentArtifact(input: { skillId: string; content: string; contentHash: string }): Promise<string>
}) {
  return {
    async resolveAndSnapshot(discovered: readonly unknown[]): Promise<readonly SkillSnapshot[]> {
      const resolved = resolveSkills(discovered)
      const prepared = resolved.map(skill => {
        const contentHash = deps.hashContent(skill.content)
        if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('skill content hash must be SHA-256')
        return { skill, contentHash }
      })
      const snapshots: SkillSnapshot[] = []
      for (const { skill, contentHash } of prepared) {
        const contentArtifactId = await deps.saveContentArtifact({
          skillId: skill.id,
          content: skill.content,
          contentHash
        })
        const snapshot = SkillSnapshotSchema.parse({
          id: skill.id,
          name: skill.name,
          version: skill.version,
          source: skill.source,
          contentHash,
          contentArtifactId
        }) as SkillSnapshot
        snapshots.push(Object.freeze(snapshot))
      }
      return Object.freeze(snapshots)
    }
  }
}
