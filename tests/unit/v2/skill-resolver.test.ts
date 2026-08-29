import { describe, expect, it } from 'vitest'
import {
  createSkillResolver,
  resolveSkills
} from '../../../src/main/v2/application/skills/skill-resolver'
import type { SkillDefinition } from '../../../src/shared/v2/contracts/skills'

function skill(overrides: Partial<SkillDefinition> & Pick<SkillDefinition, 'name' | 'source'>): SkillDefinition {
  const { name, source, ...rest } = overrides
  return {
    id: `${source.toLowerCase()}-${name}`,
    name,
    version: '1.0.0',
    source,
    description: `${name} instructions`,
    content: `content:${source}:${name}`,
    requiredToolNames: [],
    requiredMcpCapabilities: [],
    ...rest
  }
}

describe('skill resolution and snapshots', () => {
  it('resolves duplicate names with explicit project-first precedence', () => {
    const resolved = resolveSkills([
      skill({ name: 'review', source: 'BUILTIN' }),
      skill({ name: 'review', source: 'MARKETPLACE' }),
      skill({ name: 'review', source: 'USER' }),
      skill({ name: 'review', source: 'PROJECT' }),
      skill({ name: 'planning', source: 'BUILTIN' })
    ])

    expect(resolved.map(item => [item.name, item.source])).toEqual([
      ['planning', 'BUILTIN'],
      ['review', 'PROJECT']
    ])
  })

  it('rejects ambiguous duplicate skills at the same precedence', () => {
    expect(() => resolveSkills([
      skill({ id: 'project-review-v1', name: 'review', source: 'PROJECT' }),
      skill({ id: 'project-review-v2', name: 'review', source: 'PROJECT', version: '2.0.0' })
    ])).toThrow(/ambiguous/i)
  })

  it('creates immutable snapshots with exact content artifact and SHA-256 references', async () => {
    const saved: Array<{ skillId: string; content: string; contentHash: string }> = []
    const resolver = createSkillResolver({
      hashContent: () => '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881',
      saveContentArtifact: async input => {
        saved.push(input)
        return 'artifact-skill-review'
      }
    })

    const snapshots = await resolver.resolveAndSnapshot([
      skill({ name: 'review', source: 'PROJECT', content: 'x' })
    ])

    expect(saved).toEqual([{
      skillId: 'project-review',
      content: 'x',
      contentHash: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881'
    }])
    expect(snapshots).toEqual([{
      id: 'project-review',
      name: 'review',
      version: '1.0.0',
      source: 'PROJECT',
      contentHash: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881',
      contentArtifactId: 'artifact-skill-review'
    }])
    expect(Object.isFrozen(snapshots)).toBe(true)
    expect(Object.isFrozen(snapshots[0])).toBe(true)
  })

  it('validates all discovered skills before persisting any snapshot content', async () => {
    let saves = 0
    const resolver = createSkillResolver({
      hashContent: () => 'a'.repeat(64),
      saveContentArtifact: async () => { saves += 1; return 'artifact' }
    })

    await expect(resolver.resolveAndSnapshot([
      skill({ name: 'valid', source: 'PROJECT' }),
      { ...skill({ name: 'invalid', source: 'USER' }), version: '' }
    ])).rejects.toThrow()
    expect(saves).toBe(0)
  })

  it('rejects an invalid hash before persisting snapshot content', async () => {
    let saves = 0
    const resolver = createSkillResolver({
      hashContent: () => 'invalid',
      saveContentArtifact: async () => { saves += 1; return 'artifact' }
    })

    await expect(resolver.resolveAndSnapshot([
      skill({ name: 'review', source: 'PROJECT' })
    ])).rejects.toThrow(/hash/i)
    expect(saves).toBe(0)
  })
})
