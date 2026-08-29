import type { CanonicalToolCall, CanonicalToolResult } from '../../../../shared/v2/contracts/events'

export type CanonicalRuntimeEvent =
  | { kind: 'assistant.text.delta'; text: string }
  | { kind: 'assistant.reasoning.delta'; text: string }
  | { kind: 'tool.call.delta'; callId: string; fragment: string }
  | { kind: 'tool.call.completed'; call: CanonicalToolCall }
  | { kind: 'tool.result.completed'; result: CanonicalToolResult }

export type DurableEventDraft =
  | { type: 'ASSISTANT_MESSAGE'; payload: { text: string } }
  | { type: 'TOOL_CALL'; payload: CanonicalToolCall }
  | { type: 'TOOL_RESULT'; payload: CanonicalToolResult }
