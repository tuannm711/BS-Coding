import { describe, expect, it } from 'vitest'
import { probeStructuredTools } from '../../../src/main/v2/application/providers/capability-probe'
import { fakeProbeRuntime } from '../../../src/main/v2/infrastructure/providers/probe-fixtures'

describe('structured tool capability probe', () => {
  it('marks narrated-only tool behavior degraded', async () => {
    const runtime = fakeProbeRuntime([
      { kind: 'text-delta', text: 'Calling read({path:"a.ts"})' },
      { kind: 'finish', reason: 'stop' }
    ])
    expect((await probeStructuredTools(runtime)).structuredTools).toBe('DEGRADED')
  })

  it('marks a structured tool call verified', async () => {
    const runtime = fakeProbeRuntime([
      { kind: 'tool-call', callId: 'c1', toolName: 'read', arguments: { path: 'a.ts' } },
      { kind: 'finish', reason: 'tool-calls' }
    ])
    expect((await probeStructuredTools(runtime)).structuredTools).toBe('VERIFIED')
  })

  it('marks explicit lack of tool support unsupported', async () => {
    const runtime = fakeProbeRuntime([], { structuredTools: false })
    expect((await probeStructuredTools(runtime)).structuredTools).toBe('UNSUPPORTED')
  })
})
