import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { JsonStore } from '../../src/main/json-store'
import { SessionStore, type StoredSession } from '../../src/main/agent/session'
import { SnapshotStore, type SnapshotEntry } from '../../src/main/agent/snapshot'
import { SavedPermissions, type SavedPermission } from '../../src/main/agent/saved-permissions'
import { TruncationStore } from '../../src/main/agent/truncation'
import { createDefaultTools } from '../../src/main/agent/tools/registry'
import { BsAgentManager } from '../../src/main/bs-agent-manager'

function memoryStore<T>(values: T[] = []): JsonStore<T> {
  return { load: () => values, save: next => values.splice(0, values.length, ...structuredClone(next)) }
}

describe('shared session restart and deleted-Agent fallback', () => {
  it('keeps migrated history and attribution while restoring bs after an Agent disappears', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-session-restart-'))
    const configPath = path.join(dir, 'bs.json')
    writeFileSync(configPath, JSON.stringify({
      provider: { test: { apiKey: 'sk-test', models: ['fixture'] } }, model: 'test/fixture',
      agents: {
        bs: { provider: 'test', model: 'fixture', systemPrompt: 'BS' },
        reviewer: { provider: 'test', model: 'fixture', systemPrompt: 'Review' }
      }
    }))
    const sessions: StoredSession[] = []
    const store = new SessionStore(memoryStore(sessions))
    const legacy = store.create('reviewer-id', dir)
    store.appendMessage(legacy.id, { id: 'u1', role: 'user', text: 'review this', createdAt: 1 })
    store.appendMessage(legacy.id, { id: 'a1', role: 'assistant', text: 'first answer', createdAt: 2 })
    const snapshots = new SnapshotStore(memoryStore<SnapshotEntry>())
    const savedPermissions = new SavedPermissions(memoryStore<SavedPermission>())
    const agents = [
      { id: 'bs-id', name: 'bs', templateId: 'bs', cwd: dir, kind: 'native' as const },
      { id: 'reviewer-id', name: 'reviewer', templateId: 'bs', cwd: dir, kind: 'native' as const }
    ]
    const createManager = () => new BsAgentManager({
      configPath, store, snapshots, savedPermissions,
      truncation: new TruncationStore(path.join(dir, 'truncation')),
      tools: createDefaultTools(), env: {}
    })

    const first = createManager()
    await first.init(agents)
    expect(first.listSessionTranscript(dir, legacy.id)[1]).toMatchObject({
      kind: 'message', message: { text: 'first answer', execution: { agentId: 'reviewer-id', agentName: 'reviewer' } }
    })
    first.removeAgent('reviewer-id')
    expect(first.listProjectSessions(dir).find(session => session.id === legacy.id)).toMatchObject({ id: legacy.id, lastAgentId: 'bs-id' })
    expect(first.listSessionTranscript(dir, legacy.id)).toHaveLength(2)
    await first.dispose()

    const restarted = createManager()
    await restarted.init([agents[0]])
    expect(restarted.listProjectSessions(dir)).toHaveLength(1)
    expect(restarted.listProjectSessions(dir).find(session => session.id === legacy.id)).toMatchObject({ id: legacy.id, lastAgentId: 'bs-id' })
    expect(restarted.listSessionTranscript(dir, legacy.id)[1]).toMatchObject({
      kind: 'message', message: { execution: { agentId: 'reviewer-id', agentName: 'reviewer' } }
    })
    await restarted.dispose()
  })
})
