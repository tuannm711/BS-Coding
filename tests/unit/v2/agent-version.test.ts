import { describe, expect, it } from 'vitest'
import { createAgentVersion } from '../../../src/main/v2/domain/agent/agent-version'

describe('AgentVersion snapshots', () => {
  it('deeply clones and freezes configuration', () => {
    const source = {
      id: 'av1',
      revision: 1,
      tools: ['read'],
      permissions: { write: 'deny' }
    }

    const version = createAgentVersion(source)
    source.tools.push('write')
    source.permissions.write = 'allow'

    expect(version).toEqual({
      id: 'av1', revision: 1, tools: ['read'], permissions: { write: 'deny' }
    })
    expect(Object.isFrozen(version)).toBe(true)
    expect(Object.isFrozen(version.tools)).toBe(true)
    expect(Object.isFrozen(version.permissions)).toBe(true)
  })

  it('rejects mutation through the returned snapshot', () => {
    const version = createAgentVersion({ tools: ['read'] })
    expect(() => (version.tools as string[]).push('write')).toThrow(TypeError)
  })
})
