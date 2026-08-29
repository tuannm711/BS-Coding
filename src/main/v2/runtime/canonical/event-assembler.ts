import type { CanonicalRuntimeEvent, DurableEventDraft } from './stream-events'

export class EventAssembler {
  private text = ''
  private readonly completed: DurableEventDraft[] = []
  private readonly toolCallIds = new Set<string>()

  accept(event: CanonicalRuntimeEvent): void {
    if (event.kind === 'assistant.text.delta') this.text += event.text
    if (event.kind === 'tool.call.completed') {
      if (this.toolCallIds.has(event.call.callId)) throw new Error(`duplicate callId ${event.call.callId}`)
      this.toolCallIds.add(event.call.callId)
      this.completed.push({ type: 'TOOL_CALL', payload: event.call })
    }
    if (event.kind === 'tool.result.completed') {
      if (!this.toolCallIds.has(event.result.callId)) throw new Error(`unknown callId ${event.result.callId}`)
      this.completed.push({ type: 'TOOL_RESULT', payload: event.result })
    }
  }

  finish(): DurableEventDraft[] {
    const messages: DurableEventDraft[] = this.text
      ? [{ type: 'ASSISTANT_MESSAGE', payload: { text: this.text } }]
      : []
    return [...messages, ...this.completed]
  }
}
