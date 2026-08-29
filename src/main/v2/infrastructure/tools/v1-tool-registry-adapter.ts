import type { z } from 'zod'
import type { RegisteredTool } from '../../runtime/tools/protocol-guard'

interface LegacyTool {
  name: string
  description: string
  schema: z.ZodType<Record<string, unknown>>
  execute(input: unknown): Promise<unknown>
}

const metadataByName: Record<string, Pick<RegisteredTool['definition'],
  'permissionCategory' | 'sideEffectLevel' | 'outputPolicy'>> = {
  read: { permissionCategory: 'filesystem.read', sideEffectLevel: 'NONE', outputPolicy: 'INLINE' }
}

// Delete after P13 migrates every built-in/MCP/LSP tool to native V2 definitions.
export class V1ToolRegistryAdapter {
  constructor(private readonly legacy: readonly LegacyTool[]) {}

  tools(): ReadonlyMap<string, RegisteredTool> {
    return new Map(this.legacy.map(tool => {
      const metadata = metadataByName[tool.name] ?? {
        permissionCategory: 'legacy.unknown', sideEffectLevel: 'DESTRUCTIVE' as const,
        outputPolicy: 'ARTIFACT' as const
      }
      return [tool.name, {
        definition: { name: tool.name, description: tool.description,
          supportsCancellation: false, workspaceRequirement: 'PROJECT', ...metadata },
        argumentsSchema: tool.schema
      }]
    }))
  }
}
