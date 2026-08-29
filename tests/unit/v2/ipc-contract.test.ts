import { describe, expect, it } from 'vitest'
import { V2_IPC, V2_IPC_FAMILIES } from '../../../src/shared/v2/contracts/ipc'
import {
  ProjectionEventSchema,
  V2CommandEnvelopeSchema
} from '../../../src/shared/v2/schemas/ipc'

describe('V2 typed IPC contracts', () => {
  it('requires a request id for consequential commands', () => {
    expect(V2CommandEnvelopeSchema.safeParse({ input: { id: 'ws1' } }).success).toBe(false)
    expect(V2CommandEnvelopeSchema.parse({ requestId: 'r1', input: { id: 'ws1' } }))
      .toEqual({ requestId: 'r1', input: { id: 'ws1' } })
  })

  it('requires monotonic sequence and revision metadata on projection events', () => {
    expect(ProjectionEventSchema.safeParse({ sequence: 1, payload: {} }).success).toBe(false)
    expect(ProjectionEventSchema.safeParse({ sequence: 0, revision: 1, payload: {} }).success)
      .toBe(false)
    expect(ProjectionEventSchema.parse({ sequence: 1, revision: 0, payload: { status: 'RUNNING' } }))
      .toEqual({ sequence: 1, revision: 0, payload: { status: 'RUNNING' } })
  })

  it('registers every locked family under the bs.v2 namespace', () => {
    expect(V2_IPC_FAMILIES).toEqual([
      'project', 'workSession', 'workflow', 'task', 'agent', 'provider', 'workspace',
      'git', 'skill', 'mcp', 'settings', 'diagnostics', 'remote'
    ])
    expect(V2_IPC.workSession.create).toBe('bs.v2.workSession.create')
    expect(V2_IPC.workflow.projection).toBe('bs.v2.workflow.projection')
    expect(Object.values(V2_IPC).flatMap(family => Object.values(family))
      .every(channel => channel.startsWith('bs.v2.'))).toBe(true)
  })
})
