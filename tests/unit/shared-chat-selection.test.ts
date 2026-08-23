import { describe, expect, it } from 'vitest'
import { projectVisiblePanes, resolveSelectedNativeAgent } from '../../src/renderer/src/shared-chat-selection'
import type { AgentConfig } from '../../src/shared/types'
import type { PaneModel } from '../../src/renderer/src/App'

function agent(id: string, name: string, kind: AgentConfig['kind']): AgentConfig {
  return { id, name, kind, templateId: kind === 'native' ? 'bs' : 'shell', cwd: 'C:/project' }
}

function pane(config: AgentConfig): PaneModel {
  return { agent: config, state: { agentId: config.id, status: 'idle', exitCode: null, lastOutputAt: null, alert: 'normal' }, git: null }
}

describe('shared native chat selection', () => {
  const agents = [agent('bs-id', 'bs', 'native'), agent('reviewer-id', 'reviewer', 'native'), agent('pty-id', 'shell', 'pty')]

  it('keeps a valid selected native Agent', () => {
    expect(resolveSelectedNativeAgent(agents, 'reviewer-id')).toBe('reviewer-id')
  })

  it('falls back to bs, then first native Agent, then null', () => {
    expect(resolveSelectedNativeAgent(agents.filter(item => item.id !== 'reviewer-id'), 'reviewer-id')).toBe('bs-id')
    expect(resolveSelectedNativeAgent([agent('builder-id', 'builder', 'native')], 'missing')).toBe('builder-id')
    expect(resolveSelectedNativeAgent([agent('pty-id', 'shell', 'pty')], 'missing')).toBeNull()
  })

  it('projects one selected native pane and keeps every PTY pane', () => {
    const visible = projectVisiblePanes(agents.map(pane), 'reviewer-id')
    expect(visible.filter(item => item.agent.kind === 'native').map(item => item.agent.id)).toEqual(['reviewer-id'])
    expect(visible.filter(item => item.agent.kind !== 'native').map(item => item.agent.id)).toEqual(['pty-id'])
  })
})
