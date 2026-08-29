import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ProtocolGuard } from '../../../src/main/v2/runtime/tools/protocol-guard'

const readTool = {
  definition: {
    name: 'read', description: 'Read file', permissionCategory: 'filesystem.read',
    sideEffectLevel: 'NONE' as const, supportsCancellation: true, outputPolicy: 'INLINE' as const
  },
  argumentsSchema: z.object({ path: z.string().min(1) })
}

describe('ProtocolGuard', () => {
  it('never converts narrated prose into a tool call', () => {
    const guard = new ProtocolGuard(new Map([['read', readTool]]))
    expect(guard.acceptAssistantText('Calling read({"path":"a.ts"})')).toEqual({
      ok: false, code: 'PROTOCOL_VIOLATION'
    })
  })

  it('rejects unknown tools and malformed arguments', () => {
    const guard = new ProtocolGuard(new Map([['read', readTool]]))
    const base = { callId: 'c1', arguments: { path: 'a.ts' }, origin: 'model' as const,
      requestedAt: '2026-08-29T00:00:00.000Z' }
    expect(guard.validateToolCall({ ...base, toolName: 'missing' })).toMatchObject({
      ok: false, code: 'UNKNOWN_TOOL'
    })
    expect(guard.validateToolCall({ ...base, toolName: 'read', arguments: {} })).toMatchObject({
      ok: false, code: 'INVALID_ARGS'
    })
  })

  it('rejects duplicate calls and structured calls from text-only runtime', () => {
    const guard = new ProtocolGuard(new Map([['read', readTool]]))
    const call = { callId: 'c1', toolName: 'read', arguments: { path: 'a.ts' },
      origin: 'model' as const, requestedAt: '2026-08-29T00:00:00.000Z' }
    expect(guard.validateToolCall(call)).toMatchObject({ ok: true })
    expect(guard.validateToolCall(call)).toMatchObject({ ok: false, code: 'DUPLICATE_CALL' })
    guard.releaseCall('c1')
    expect(guard.validateToolCall(call)).toMatchObject({ ok: true })

    const textOnly = new ProtocolGuard(new Map([['read', readTool]]), { structuredTools: false })
    expect(textOnly.validateToolCall(call)).toMatchObject({
      ok: false, code: 'CAPABILITY_VIOLATION'
    })
  })
})
