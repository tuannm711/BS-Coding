import type { ContextPacket } from '../../../../shared/v2/contracts/context'
import type { CanonicalToolCall, CanonicalToolResult } from '../../../../shared/v2/contracts/events'

export type NativeContextMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'tool-call'; callId: string; toolName: string; arguments: unknown }
  | { role: 'tool-result'; callId: string; content: CanonicalToolResult }

export function projectContext(
  packet: ContextPacket,
  capability: { structuredToolHistory: boolean }
): NativeContextMessage[] {
  const projected: NativeContextMessage[] = [
    ...packet.system.map(content => ({ role: 'system' as const, content })),
    { role: 'user', content: `Goal: ${packet.goal}` }
  ]
  for (const event of packet.history) {
    if (event.type === 'USER_MESSAGE' || event.type === 'ASSISTANT_MESSAGE') {
      projected.push({ role: event.type === 'USER_MESSAGE' ? 'user' : 'assistant',
        content: (event.payload as { text: string }).text })
    } else if (event.type === 'TOOL_CALL') {
      const call = event.payload as CanonicalToolCall
      projected.push(capability.structuredToolHistory
        ? { role: 'tool-call', callId: call.callId, toolName: call.toolName, arguments: call.arguments }
        : { role: 'user', content: `Past execution record: tool ${call.toolName} was requested (call ${call.callId}).` })
    } else if (event.type === 'TOOL_RESULT') {
      const result = event.payload as CanonicalToolResult
      projected.push(capability.structuredToolHistory
        ? { role: 'tool-result', callId: result.callId, content: result }
        : { role: 'user', content: `Past execution record: call ${result.callId} ended with status ${result.status}.` })
    }
  }
  return projected
}
