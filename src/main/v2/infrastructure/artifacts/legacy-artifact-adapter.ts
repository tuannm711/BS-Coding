import { statSync } from 'node:fs'
import type { ArtifactRef } from '../../application/ports/artifact-store'

interface LegacyArtifactEntry {
  id: string
  path: string
  absPath: string
  kind: string
  agentId: string
  agentName: string
  ts: number
}

export interface LegacyArtifactSource {
  list(projectPath: string): LegacyArtifactEntry[]
}

// P18 deletion criterion: remove after V1 artifact metadata is imported and V2
// is the sole artifact writer. Structural typing prevents legacy types leaking in.
export class LegacyArtifactAdapter {
  constructor(
    private readonly source: LegacyArtifactSource,
    private readonly sizeOf: (filePath: string) => number = filePath => statSync(filePath).size
  ) {}

  list(projectId: string, projectPath: string): ArtifactRef[] {
    return this.source.list(projectPath).map(entry => ({
      id: entry.id,
      projectId,
      kind: entry.kind,
      path: entry.absPath,
      size: this.sizeOf(entry.absPath)
    }))
  }
}
