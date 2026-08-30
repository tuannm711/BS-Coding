import type { CanonicalToolCall } from './events'

export const RUNTIME_STREAM_KINDS = [
  'text-delta', 'reasoning-delta', 'tool-call', 'finish', 'error'
] as const

export interface RuntimeUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  costUsd?: number
}

export type RuntimeStreamPart =
  | { kind: 'text-delta'; text: string }
  | { kind: 'reasoning-delta'; text: string }
  | { kind: 'tool-call'; call: CanonicalToolCall }
  | { kind: 'finish'; reason: string; usage?: RuntimeUsage }
  | { kind: 'error'; error: { code: string; message: string } }
