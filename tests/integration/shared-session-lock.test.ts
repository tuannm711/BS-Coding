import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { JsonStore } from '../../src/main/json-store'
import { BsAgentManager } from '../../src/main/bs-agent-manager'
import { SessionStore, type StoredSession } from '../../src/main/agent/session'
import { SnapshotStore, type SnapshotEntry } from '../../src/main/agent/snapshot'
import { SavedPermissions, type SavedPermission } from '../../src/main/agent/saved-permissions'
import { TruncationStore } from '../../src/main/agent/truncation'
import { createDefaultTools } from '../../src/main/agent/tools/registry'
import type { LlmClient } from '../../src/main/agent/llm'
import type { ProviderConnection } from '../../src/shared/types'

function memoryStore<T>(): JsonStore<T> {
  const values: T[] = []
  return { load: () => values, save: next => values.splice(0, values.length, ...structuredClone(next)) }
}

describe('shared session execution lock', () => {
  it('binds queued messages to the running Agent and Stop clears the session lock', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-shared-lock-'))
    const configPath = path.join(dir, 'bs.json')
    writeFileSync(configPath, JSON.stringify({
      provider: {}, model: '', agents: {
        bs: { provider: 'openai', accountId: 'account', model: 'gpt-code', systemPrompt: 'BS' }
      }
    }))
    let markStarted!: () => void
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const runtime: LlmClient = {
      async *stream(options) {
        markStarted()
        await new Promise<void>(resolve => options.signal?.addEventListener('abort', () => resolve(), { once: true }))
        yield { kind: 'finish', finishReason: 'stop' }
      }
    }
    const connection: ProviderConnection = {
      providerId: 'openai', models: ['gpt-code'],
      accounts: [{ id: 'account', label: 'Pro', authMode: 'oauth', status: 'active', models: ['gpt-code'] }]
    }
    const manager = new BsAgentManager({
      configPath,
      assignmentPath: path.join(dir, 'assignments.json'),
      store: new SessionStore(memoryStore<StoredSession>()),
      snapshots: new SnapshotStore(memoryStore<SnapshotEntry>()),
      savedPermissions: new SavedPermissions(memoryStore<SavedPermission>()),
      truncation: new TruncationStore(path.join(dir, 'truncation')),
      tools: createDefaultTools(),
      providerAccounts: () => [connection],
      providerRuntime: () => runtime
    })
    const agent = { id: 'bs-id', name: 'bs', templateId: 'bs', cwd: dir, kind: 'native' as const }
    await manager.init([agent])
    const session = manager.createProjectSession(dir, agent.id)

    const running = manager.sendInSession(dir, session.id, agent.id, 'first')
    await started
    await expect(manager.sendInSession(dir, session.id, agent.id, 'queued')).resolves.toBeUndefined()
    expect(manager.getSessionState(session.id)).toMatchObject({ locked: true, agentId: agent.id })
    expect(manager.listSessionQueued(session.id)).toEqual([
      expect.objectContaining({ agentId: agent.id, text: 'queued' })
    ])

    const queuedId = manager.listSessionQueued(session.id)[0].id
    manager.editSessionQueued(dir, session.id, queuedId, 'edited')
    expect(manager.listSessionQueued(session.id)[0].text).toBe('edited')
    manager.removeSessionQueued(dir, session.id, queuedId)
    expect(manager.listSessionQueued(session.id)).toEqual([])
    await manager.sendInSession(dir, session.id, agent.id, 'queued again')

    manager.stopSessionChat(dir, session.id)
    await running
    expect(manager.listSessionQueued(session.id)).toEqual([])
    expect(manager.getSessionState(session.id)).toBeNull()
    await manager.dispose()
  })

  it('undoes and redoes the latest completed turn by session across Agents', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-shared-undo-'))
    const configPath = path.join(dir, 'bs.json')
    writeFileSync(configPath, JSON.stringify({ provider: {}, model: '', agents: {} }))
    const sessionStore = new SessionStore(memoryStore<StoredSession>())
    const snapshotStore = new SnapshotStore(memoryStore<SnapshotEntry>())
    const manager = new BsAgentManager({
      configPath,
      store: sessionStore,
      snapshots: snapshotStore,
      savedPermissions: new SavedPermissions(memoryStore<SavedPermission>()),
      truncation: new TruncationStore(path.join(dir, 'truncation')),
      tools: createDefaultTools()
    })
    const agents = [
      { id: 'agent-a', name: 'a', templateId: 'bs', cwd: dir, kind: 'native' as const },
      { id: 'agent-b', name: 'b', templateId: 'bs', cwd: dir, kind: 'native' as const }
    ]
    await manager.init(agents)
    const session = manager.createProjectSession(dir, 'agent-a')
    const execution = {
      turnId: 'turn-b', agentId: 'agent-b', agentName: 'b', providerId: 'openai', modelId: 'gpt-code',
      speed: 'standard' as const, startedAt: 1, completedAt: 2, status: 'completed' as const
    }
    sessionStore.appendMessage(session.id, { id: 'user-b', role: 'user', text: 'change', turnId: 'turn-b', execution, createdAt: 1 })
    sessionStore.appendMessage(session.id, { id: 'assistant-b', role: 'assistant', text: 'done', turnId: 'turn-b', execution, createdAt: 2 })
    snapshotStore.beginTurn(session.id, { projectPath: dir, sessionId: session.id, turnId: 'turn-b', agentId: 'agent-b' })
    snapshotStore.snapshot(session.id, path.join(dir, 'file.txt'), 'before')
    snapshotStore.commitTurn(session.id)

    expect(manager.undoSession(dir, session.id)).toEqual({ agentId: 'agent-b', turnId: 'turn-b' })
    expect(sessionStore.transcript(session.id)).toEqual([])
    expect(manager.redoSession(dir, session.id)).toEqual({ agentId: 'agent-b', turnId: 'turn-b' })
    expect(sessionStore.transcript(session.id)).toHaveLength(2)
    await manager.dispose()
  })
})
