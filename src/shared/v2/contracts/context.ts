import type { CanonicalEvent } from './events'

export interface ContextArtifact {
  id: string
  summary: string
}

export interface ContextPacket {
  system: readonly string[]
  goal: string
  task?: string
  history: readonly CanonicalEvent[]
  artifacts: readonly ContextArtifact[]
  toolSchemas: readonly { name: string; description: string }[]
  maxInputTokens: number
}
