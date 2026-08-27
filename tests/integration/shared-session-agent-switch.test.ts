import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ModelMessage } from 'ai'
import type { JsonStore } from '../../src/main/json-store'
import { BsAgentManager } from '../../src/main/bs-agent-manager'
import { SessionStore, type StoredSession } from '../../src/main/agent/session'
import { SnapshotStore, type SnapshotTurn } from '../../src/main/agent/snapshot'
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
      { providerId: 'openai', activeAccountId: 'openai-account', accounts: [{ id: 'openai-account', providerId: 'openai', label: 'OpenAI Pro', authMode: 'oauth', status: 'active', models: ['gpt-code'], createdAt: 1, lastUsedAt: 1 }] },
      { providerId: 'antigravity', activeAccountId: 'anti-account', accounts: [{ id: 'anti-account', providerId: 'antigravity', label: 'Antigravity Pro', authMode: 'oauth', status: 'active', models: ['gemini-code'], createdAt: 1, lastUsedAt: 1 }] }
    ]
    const manager = new BsAgentManager({
      configPath,
      assignmentPath: path.join(dir, 'assignments.json'),
      store: new SessionStore(memoryStore<StoredSession>()),
      snapshots: new SnapshotStore(memoryStore<SnapshotTurn>()),
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
    // No tool-call assertion here: both stubbed turns are text only, so this
    // fixture could never exhibit one. The native shape is pinned in
    // neutral-context.test.ts, whose fixture has a call to replay; what this
    // test proves is that the second provider sees the first agent's history
    // at all, and sees nothing provider-specific in it.
    //
    // No note explaining a record format either, because there are no records.
    expect(systems.get('antigravity')).not.toContain('Session log')
    expect(systems.get('antigravity')).not.toContain('call it through the tool interface')
    expect(events.filter(event => event.type === 'turn-started')).toEqual([
      expect.objectContaining({ agentId: alpha.id, sessionId: session.id, projectPath: dir }),
      expect.objectContaining({ agentId: beta.id, sessionId: session.id, projectPath: dir })
    ])
    await manager.dispose()
  })
})
