import { describe, expect, it, vi } from 'vitest'
import type { Command } from '../../src/shared/types'
import { dispatchRemoteCommand, type RemoteCommandContext } from '../../src/main/remote/remote-commands'
import type { RemoteCommandName } from '../../src/shared/remote-types'

const ALL_COMMANDS: RemoteCommandName[] = [
  'workspace:list',
  'agent:list',
  'agent:state',
  'session:list',
  'session:create',
  'session:switch',
  'session:rename',
  'chat:send'
]

function makeCtx(overrides: Partial<RemoteCommandContext> = {}) {
  const bsAgent = {
    listAgents: vi.fn(),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    switchSession: vi.fn(),
    renameSession: vi.fn(),
    listMessages: vi.fn(),
    send: vi.fn(async () => {}),
    respondPrompt: vi.fn(),
    runCommand: vi.fn(async () => {}),
    listCommands: vi.fn((): Command[] => []),
    isRunning: vi.fn(),
    isBackground: vi.fn()
    ,listProjectSessions: vi.fn()
    ,createProjectSession: vi.fn()
    ,switchProjectSession: vi.fn()
    ,selectProjectSessionAgent: vi.fn()
    ,listSessionTranscript: vi.fn()
    ,sendInSession: vi.fn(async () => {})
  }
  const workspaceStore = { list: vi.fn() }
  const ctx: RemoteCommandContext = {
    bsAgent,
    workspaceStore,
    isEnabled: vi.fn(() => true),
    ...overrides
  }
  return { ctx, bsAgent, workspaceStore }
}

function agent(id: string, name: string) {
  return { id, name, templateId: 't1', cwd: `/work/${id}` }
}

describe('dispatchRemoteCommand', () => {
  it('returns remote disabled for every command and never calls the handlers', async () => {
    const { ctx, bsAgent, workspaceStore } = makeCtx({ isEnabled: vi.fn(() => false) })
    for (const cmd of ALL_COMMANDS) {
      const res = await dispatchRemoteCommand(cmd, { agentId: 'a1', sessionId: 's1', title: 'T', text: 'hi' }, ctx)
      expect(res).toEqual({ ok: false, error: 'remote disabled' })
    }
    expect(ctx.isEnabled).toHaveBeenCalledTimes(ALL_COMMANDS.length)
    const handlers = [
      bsAgent.listAgents, bsAgent.listSessions, bsAgent.createSession,
      bsAgent.switchSession, bsAgent.renameSession, bsAgent.send,
      bsAgent.isRunning, bsAgent.isBackground, workspaceStore.list
    ]
    for (const handler of handlers) expect(handler).not.toHaveBeenCalled()
  })

  it('workspace:list returns the workspaces from the store', async () => {
    const { ctx, workspaceStore } = makeCtx()
    const workspaces = [
      { projectPath: '/a', name: 'A', agentCount: 1 },
      { projectPath: '/b', name: 'B', agentCount: 2 }
    ]
    workspaceStore.list.mockReturnValue(workspaces)
    const res = await dispatchRemoteCommand('workspace:list', {}, ctx)
    expect(res).toEqual({ ok: true, result: workspaces })
  })

  it('agent:list returns only id, name, cwd and kind', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([
      { id: 'a1', name: 'One', templateId: 't1', cwd: '/work/one', kind: 'native', model: 'gpt-x', apiKey: 'secret' },
      { id: 'a2', name: 'Two', templateId: 't2', cwd: '/work/two' }
    ])
    const res = await dispatchRemoteCommand('agent:list', {}, ctx)
    expect(res).toEqual({
      ok: true,
      result: [
        { id: 'a1', name: 'One', cwd: '/work/one', kind: 'native' },
        { id: 'a2', name: 'Two', cwd: '/work/two', kind: undefined }
      ]
    })
  })

  it('agent:state returns running and background from the manager', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    bsAgent.isRunning.mockReturnValue(true)
    bsAgent.isBackground.mockReturnValue(false)
    const res = await dispatchRemoteCommand('agent:state', { agentId: 'a1' }, ctx)
    expect(bsAgent.isRunning).toHaveBeenCalledWith('a1')
    expect(bsAgent.isBackground).toHaveBeenCalledWith('a1')
    expect(res).toEqual({ ok: true, result: { running: true, background: false } })
  })

  it('agent:state errors for a nonexistent agent without calling the state methods', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const res = await dispatchRemoteCommand('agent:state', { agentId: 'nope' }, ctx)
    expect(res).toEqual({ ok: false, error: 'unknown agent: nope' })
    expect(bsAgent.isRunning).not.toHaveBeenCalled()
    expect(bsAgent.isBackground).not.toHaveBeenCalled()
  })

  it('session:list returns the sessions for the agent', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const sessions = [{ id: 's1', agentId: 'a1', title: 'S1', messageCount: 0, createdAt: 1, updatedAt: 2 }]
    bsAgent.listSessions.mockReturnValue(sessions)
    const res = await dispatchRemoteCommand('session:list', { agentId: 'a1' }, ctx)
    expect(bsAgent.listSessions).toHaveBeenCalledWith('a1')
    expect(res).toEqual({ ok: true, result: sessions })
  })

  it('session:create calls createSession and returns the summary', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const summary = { id: 's2', agentId: 'a1', title: 'S2', messageCount: 0, createdAt: 3, updatedAt: 4 }
    bsAgent.createSession.mockReturnValue(summary)
    const res = await dispatchRemoteCommand('session:create', { agentId: 'a1' }, ctx)
    expect(bsAgent.createSession).toHaveBeenCalledWith('a1')
    expect(res).toEqual({ ok: true, result: summary })
  })

  it('session:switch calls switchSession with the exact args', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const summary = { id: 's1', agentId: 'a1', title: 'S1', messageCount: 0, createdAt: 1, updatedAt: 2 }
    bsAgent.switchSession.mockReturnValue(summary)
    const res = await dispatchRemoteCommand('session:switch', { agentId: 'a1', sessionId: 's1' }, ctx)
    expect(bsAgent.switchSession).toHaveBeenCalledTimes(1)
    expect(bsAgent.switchSession).toHaveBeenCalledWith('a1', 's1')
    expect(res).toEqual({ ok: true, result: summary })
  })

  it('session:switch errors for a nonexistent agent without calling switchSession', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const res = await dispatchRemoteCommand('session:switch', { agentId: 'nope', sessionId: 's1' }, ctx)
    expect(res).toEqual({ ok: false, error: 'unknown agent: nope' })
    expect(bsAgent.switchSession).not.toHaveBeenCalled()
  })

  it('session:rename calls renameSession with agentId, sessionId and title', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const summary = { id: 's1', agentId: 'a1', title: 'New', messageCount: 1, createdAt: 1, updatedAt: 5 }
    bsAgent.renameSession.mockReturnValue(summary)
    const res = await dispatchRemoteCommand('session:rename', { agentId: 'a1', sessionId: 's1', title: 'New' }, ctx)
    expect(bsAgent.renameSession).toHaveBeenCalledWith('a1', 's1', 'New')
    expect(res).toEqual({ ok: true, result: summary })
  })

  it('session:messages returns the message history for the agent', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const msgs = [{ id: 'm1', role: 'user', text: 'hi', createdAt: 1 }]
    bsAgent.listMessages.mockReturnValue(msgs)
    const res = await dispatchRemoteCommand('session:messages', { agentId: 'a1' }, ctx)
    expect(res).toEqual({ ok: true, result: msgs })
    expect(bsAgent.listMessages).toHaveBeenCalledWith('a1')
  })

  it('chat:respond calls respondPrompt with allow and optional text', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const res = await dispatchRemoteCommand('chat:respond', {
      agentId: 'a1', promptId: 'p1', allow: true, text: 'yes', always: true
    }, ctx)
    expect(res).toEqual({ ok: true, result: { responded: true } })
    expect(bsAgent.respondPrompt).toHaveBeenCalledWith('a1', 'p1', { allow: true, text: 'yes', always: true })
  })

  it('chat:respond requires promptId', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const res = await dispatchRemoteCommand('chat:respond', { agentId: 'a1', allow: true }, ctx)
    expect(res.ok).toBe(false)
    expect(bsAgent.respondPrompt).not.toHaveBeenCalled()
  })

  it('chat:send routes a known slash command to runCommand, not send', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    bsAgent.listCommands.mockReturnValue([{ name: 'help', description: 'Help', template: 'help', type: 'prompt' as const }])
    const res = await dispatchRemoteCommand('chat:send', { agentId: 'a1', text: '/help xyz' }, ctx)
    expect(res).toEqual({ ok: true, result: { queued: true } })
    expect(bsAgent.runCommand).toHaveBeenCalledWith('a1', 'help', 'xyz')
    expect(bsAgent.send).not.toHaveBeenCalled()
  })

  it('chat:send falls back to send for an unknown slash command', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    bsAgent.listCommands.mockReturnValue([{ name: 'help', description: 'Help', template: 'help', type: 'prompt' as const }])
    const res = await dispatchRemoteCommand('chat:send', { agentId: 'a1', text: '/nope hi' }, ctx)
    expect(res.ok).toBe(true)
    expect(bsAgent.send).toHaveBeenCalledWith('a1', '/nope hi')
    expect(bsAgent.runCommand).not.toHaveBeenCalled()
  })

  it('chat:send calls send with the exact agentId and text and returns queued', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const res = await dispatchRemoteCommand('chat:send', { agentId: 'a1', text: 'hello there' }, ctx)
    expect(bsAgent.send).toHaveBeenCalledTimes(1)
    expect(bsAgent.send).toHaveBeenCalledWith('a1', 'hello there')
    expect(res).toEqual({ ok: true, result: { queued: true } })
  })

  it('routes project/session chat to the exact shared session', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    bsAgent.listProjectSessions.mockReturnValue([{ id: 's1', projectPath: '/work', title: 'S', messageCount: 0, createdAt: 1, updatedAt: 1 }])
    const res = await dispatchRemoteCommand('chat:send', {
      projectPath: '/work', sessionId: 's1', agentId: 'a1', text: 'continue'
    }, ctx)
    expect(bsAgent.sendInSession).toHaveBeenCalledWith('/work', 's1', 'a1', 'continue')
    expect(bsAgent.send).not.toHaveBeenCalled()
    expect(res).toEqual({ ok: true, result: { queued: true } })
  })

  it('rejects a remote session outside the requested project', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    bsAgent.listProjectSessions.mockReturnValue([])
    const res = await dispatchRemoteCommand('chat:send', {
      projectPath: '/other', sessionId: 's1', agentId: 'a1', text: 'continue'
    }, ctx)
    expect(res).toEqual({ ok: false, error: 'unknown session: s1' })
    expect(bsAgent.sendInSession).not.toHaveBeenCalled()
  })

  it('chat:send rejects empty text without calling send', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    const res = await dispatchRemoteCommand('chat:send', { agentId: 'a1', text: '   ' }, ctx)
    expect(res).toEqual({ ok: false, error: 'text is required' })
    expect(bsAgent.send).not.toHaveBeenCalled()
  })

  it('returns an error for an unknown command', async () => {
    const { ctx } = makeCtx()
    const res = await dispatchRemoteCommand('bogus:cmd' as RemoteCommandName, {}, ctx)
    expect(res).toEqual({ ok: false, error: 'unknown command' })
  })

  it('returns missing required param when agentId is absent', async () => {
    const { ctx, bsAgent } = makeCtx()
    const res = await dispatchRemoteCommand('agent:state', {}, ctx)
    expect(res).toEqual({ ok: false, error: 'missing required param: agentId' })
    expect(bsAgent.isRunning).not.toHaveBeenCalled()
  })

  it('wraps a throwing handler into an error result instead of rejecting', async () => {
    const { ctx, bsAgent } = makeCtx()
    bsAgent.listAgents.mockReturnValue([agent('a1', 'One')])
    bsAgent.listSessions.mockImplementation(() => {
      throw new Error('boom')
    })
    const res = await dispatchRemoteCommand('session:list', { agentId: 'a1' }, ctx)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('boom')
  })
})
