export type SkillSource = 'BUILTIN' | 'MARKETPLACE' | 'USER' | 'PROJECT'

export interface SkillDefinition {
  id: string
  name: string
  version: string
  source: SkillSource
  description: string
  content: string
  requiredToolNames: readonly string[]
  requiredMcpCapabilities: readonly string[]
}

export interface SkillSnapshot {
  id: string
  name: string
  version: string
  source: SkillSource
  contentHash: string
  contentArtifactId: string
}
