import { describe, expect, it } from 'vitest'
import { CanonicalToolCallSchema, ToolDefinitionSchema } from '../../../src/shared/v2/schemas/tool-call'

describe('structured tool protocol schemas', () => {
  it('requires callId, tool name and JSON object arguments', () => {
    expect(CanonicalToolCallSchema.safeParse({ toolName: 'read' }).success).toBe(false)
    expect(CanonicalToolCallSchema.safeParse({
      callId: 'c1', toolName: 'read', arguments: { path: 'a.ts' },
      origin: 'model', requestedAt: '2026-08-29T00:00:00.000Z'
    }).success).toBe(true)
    expect(CanonicalToolCallSchema.safeParse({
      callId: 'c1', toolName: 'read', arguments: 'read({path:"a.ts"})',
      origin: 'model', requestedAt: '2026-08-29T00:00:00.000Z'
    }).success).toBe(false)
  })

  it('requires permission, side-effect, cancellation and output metadata', () => {
    expect(ToolDefinitionSchema.safeParse({ name: 'read', description: 'Read file' }).success).toBe(false)
    expect(ToolDefinitionSchema.safeParse({
      name: 'read', description: 'Read file', permissionCategory: 'filesystem.read',
      sideEffectLevel: 'NONE', supportsCancellation: true, outputPolicy: 'INLINE'
    }).success).toBe(true)
  })
})
