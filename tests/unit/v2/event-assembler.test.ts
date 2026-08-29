import { describe, expect, it } from 'vitest'
import { EventAssembler } from '../../../src/main/v2/runtime/canonical/event-assembler'

describe('EventAssembler', () => {
  it('folds text deltas into one durable assistant message', () => {
    const assembler = new EventAssembler()
    assembler.accept({ kind: 'assistant.text.delta', text: 'hello ' })
    assembler.accept({ kind: 'assistant.reasoning.delta', text: 'secret thought' })
    assembler.accept({ kind: 'assistant.text.delta', text: 'world' })
    expect(assembler.finish()).toEqual([{ type: 'ASSISTANT_MESSAGE', payload: { text: 'hello world' } }])
  })

  it('does not persist partial tool calls', () => {
    const assembler = new EventAssembler()
    assembler.accept({ kind: 'tool.call.delta', callId: 'c1', fragment: '{"path":' })
    expect(assembler.finish()).toEqual([])
  })

  it('keeps narrated tool-like prose as assistant text', () => {
    const assembler = new EventAssembler()
    assembler.accept({ kind: 'assistant.text.delta', text: 'Calling read({path:"a.ts"})' })
    expect(assembler.finish()).toEqual([{
      type: 'ASSISTANT_MESSAGE', payload: { text: 'Calling read({path:"a.ts"})' }
    }])
  })

  it('emits only completed structured tool calls', () => {
    const assembler = new EventAssembler()
    assembler.accept({ kind: 'tool.call.completed', call: {
      callId: 'c1', toolName: 'read', arguments: { path: 'a.ts' },
      origin: 'model', requestedAt: '2026-08-29T00:00:00.000Z'
    } })
    expect(assembler.finish()).toEqual([{ type: 'TOOL_CALL', payload: expect.objectContaining({ callId: 'c1' }) }])
  })

  it('rejects duplicate call ids and orphan tool results', () => {
    const assembler = new EventAssembler()
    const call = { callId: 'c1', toolName: 'read', arguments: {}, origin: 'model' as const,
      requestedAt: '2026-08-29T00:00:00.000Z' }
    assembler.accept({ kind: 'tool.call.completed', call })
    expect(() => assembler.accept({ kind: 'tool.call.completed', call })).toThrow(/duplicate/i)

    const orphan = new EventAssembler()
    expect(() => orphan.accept({ kind: 'tool.result.completed', result: {
      callId: 'missing', status: 'success', completedAt: '2026-08-29T00:00:00.000Z'
    } })).toThrow(/unknown callId/i)
  })
})
