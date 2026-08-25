import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ModelMessage } from 'ai'
import type { JsonStore } from '../../src/main/json-store'
import { BsAgentManager } from '../../src/main/bs-agent-manager'
import { SessionStore, type StoredSession } from '../../src/main/agent/session'
import { SnapshotStore, type SnapshotEntry } from '../../src/main/agent/snapshot'
import { SavedPermissions, type SavedPermission } from '../../src/main/agent/saved-permissions'
import { TruncationStore } from '../../src/main/agent/truncation'
import { CommandStore } from '../../src/main/agent/commands'
import { createDefaultTools } from '../../src/main/agent/tools/registry'
import type { ChatEvent, ProviderConnection } from '../../src/shared/types'
import type { LlmClient, LlmStreamOptions } from '../../src/main/agent/llm'

function memoryStore<T>(): JsonStore<T> {
  const values: T[] = []
  return { load: () => values, save: next => values.splice(0, values.length, ...structuredClone(next)) }
}

describe('shared session Agent switching', () => {
  it('continues one transcript through sequential Agents with neutral prior context', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-shared-agent-'))
    const configPath = path.join(dir, 'bs.json')
    writeFileSync(configPath, JSON.stringify({
      provider: {}, model: '', agents: {
        alpha: { provider: 'openai', accountId: 'openai-account', model: 'gpt-code', systemPrompt: 'Alpha' },
        beta: { provider: 'antigravity', accountId: 'anti-account', model: 'gemini-code', systemPrompt: 'Beta' }
      }
    }))
    const requests = new Map<string, ModelMessage[]>()
    const systems = new Map<string, string>()
    const runtime = (providerId: string): LlmClient => ({
      async *stream(options: LlmStreamOptions) {
        requests.set(providerId, structuredClone(options.messages))
        systems.set(providerId, options.system)
        yield { kind: 'text', text: providerId === 'openai' ? 'alpha answer' : 'beta answer' }
        yield { kind: 'finish', finishReason: 'stop', tokens: { input: 1, output: 1, total: 2 } }
      }
    })
    const connections: ProviderConnection[] = [
      { providerId: 'openai', models: ['gpt-code'], accounts: [{ id: 'openai-account', label: 'OpenAI Pro', authMode: 'oauth', status: 'active', models: ['gpt-code'] }] },
      { providerId: 'antigravity', models: ['gemini-code'], accounts: [{ id: 'anti-account', label: 'Antigravity Pro', authMode: 'oauth', status: 'active', models: ['gemini-code'] }] }
    ]
    const manager = new BsAgentManager({
      configPath,
      assignmentPath: path.join(dir, 'assignments.json'),
      store: new SessionStore(memoryStore<StoredSession>()),
      snapshots: new SnapshotStore(memoryStore<SnapshotEntry>()),
      savedPermissions: new SavedPermissions(memoryStore<SavedPermission>()),
      truncation: new TruncationStore(path.join(dir, 'truncation')),
      commands: new CommandStore(path.join(dir, 'commands.json')),
      tools: createDefaultTools(),
      providerAccounts: () => connections,
      providerRuntime: providerId => runtime(providerId)
    })
    const events: ChatEvent[] = []
    manager.setOnEvent(event => events.push(event))
    const alpha = { id: 'agent-a', name: 'alpha', templateId: 'bs', cwd: dir, kind: 'native' as const }
    const beta = { id: 'agent-b', name: 'beta', templateId: 'bs', cwd: dir, kind: 'native' as const }
    await manager.init([alpha, beta])

    const session = manager.createProjectSession(dir, alpha.id)
    await manager.sendInSession(dir, session.id, alpha.id, 'inspect package')
    manager.selectProjectSessionAgent(dir, session.id, beta.id)
    await manager.sendInSession(dir, session.id, beta.id, 'continue the review')

    const transcript = manager.listSessionTranscript(dir, session.id)
    expect(transcript.filter(item => item.kind === 'message')).toHaveLength(4)
    expect(transcript.at(-1)).toMatchObject({
      kind: 'message',
      message: { text: 'beta answer', execution: { agentId: beta.id, providerId: 'antigravity', modelId: 'gemini-code' } }
    })
    const betaContext = JSON.stringify(requests.get('antigravity'))
    expect(betaContext).toContain('alpha answer')
    expect(betaContext).not.toContain('thoughtSignature')
    expect(betaContext).not.toContain('tool-call')
    // The record blocks only appear on this path, so the note explaining them
    // must appear here and nowhere else.
    expect(systems.get('antigravity')).toContain('Session log')
    expect(systems.get('antigravity')).toContain('call it through the tool interface')
    expect(events.filter(event => event.type === 'turn-started')).toEqual([
      expect.objectContaining({ agentId: alpha.id, sessionId: session.id, projectPath: dir }),
      expect.objectContaining({ agentId: beta.id, sessionId: session.id, projectPath: dir })
    ])
    await manager.dispose()
  })
})
