import type { CanonicalToolCall } from './events'

export const RUNTIME_STREAM_KINDS = [
  'text-delta', 'reasoning-delta', 'tool-call', 'finish', 'error'
] as const

export type RuntimeStreamPart =
  | { kind: 'text-delta'; text: string }
  | { kind: 'reasoning-delta'; text: string }
  | { kind: 'tool-call'; call: CanonicalToolCall }
  | { kind: 'finish'; reason: string }
  | { kind: 'error'; error: { code: string; message: string } }
