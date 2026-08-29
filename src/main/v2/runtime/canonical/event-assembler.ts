import type { CanonicalRuntimeEvent, DurableEventDraft } from './stream-events'

export class EventAssembler {
  private text = ''
  private readonly completed: DurableEventDraft[] = []

  accept(event: CanonicalRuntimeEvent): void {
    if (event.kind === 'assistant.text.delta') this.text += event.text
    if (event.kind === 'tool.call.completed') {
      this.completed.push({ type: 'TOOL_CALL', payload: event.call })
    }
    if (event.kind === 'tool.result.completed') {
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
