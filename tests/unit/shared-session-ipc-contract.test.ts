import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Channels } from '../../src/shared/ipc'
import type { AgentApi } from '../../src/shared/ipc'

describe('shared-session IPC contract', () => {
  it('defines every additive session-native AgentApi method and channel', () => {
    const methods: Array<keyof AgentApi> = [
      'listProjectSessions', 'createProjectSession', 'switchProjectSession',
      'deleteProjectSession', 'renameProjectSession', 'selectProjectSessionAgent',
      'sendSessionChat', 'stopSessionChat', 'listSessionTranscript'
    ]
    expect(methods).toHaveLength(9)
    expect(Channels.ChatSend).toBe('chat:send')
    expect(Channels.ChatStop).toBe('chat:stop')
    expect(Channels.SessionSelectAgent).toBe('session:select-agent')
    expect(Channels.ProjectSessionList).toBe('project-session:list')
  })

  it('passes project, session, Agent, text, and images in canonical order', () => {
    const preload = readFileSync(path.resolve('src/preload/index.ts'), 'utf-8')
    expect(preload).toMatch(/sendSessionChat:[\s\S]*?ipcRenderer\.invoke\(Channels\.ChatSend, projectPath, sessionId, agentId, text, images\)/)
    expect(preload).toContain('ipcRenderer.invoke(Channels.SessionSelectAgent, projectPath, sessionId, agentId)')
  })
})
