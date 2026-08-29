export type { CanonicalToolCall, CanonicalToolResult } from './events'

export type SideEffectLevel = 'NONE' | 'LOCAL_WRITE' | 'EXTERNAL_WRITE' | 'DESTRUCTIVE'
export type OutputPolicy = 'INLINE' | 'TRUNCATE' | 'ARTIFACT'
export type Permission = 'ALLOW' | 'ASK' | 'DENY'

export interface ToolDefinition {
  name: string
  description: string
  permissionCategory: string
  sideEffectLevel: SideEffectLevel
  supportsCancellation: boolean
  outputPolicy: OutputPolicy
  workspaceRequirement?: 'NONE' | 'PROJECT' | 'ISOLATED_WRITE'
}
