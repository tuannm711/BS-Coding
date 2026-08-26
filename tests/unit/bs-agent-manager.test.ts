import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BsAgentManager } from '../../src/main/bs-agent-manager'
import type { BsAgentManagerDeps } from '../../src/main/bs-agent-manager'
import { SessionStore } from '../../src/main/agent/session'
import type { StoredSession } from '../../src/main/agent/session'
import type { JsonStore } from '../../src/main/json-store'
import { ModelsCatalog } from '../../src/main/models-catalog'
import { createDefaultTools } from '../../src/main/agent/tools/registry'
import { configToSettings, DEFAULT_BS_CONFIG } from '../../src/main/agent/config'
import { SnapshotStore } from '../../src/main/agent/snapshot'
import type { SnapshotTurn } from '../../src/main/agent/snapshot'
import { TruncationStore } from '../../src/main/agent/truncation'
import { CommandStore } from '../../src/main/agent/commands'
import { SavedPermissions } from '../../src/main/agent/saved-permissions'
import type { SavedPermission } from '../../src/main/agent/saved-permissions'
import type { LlmClient, LlmStreamOptions, LlmStreamPart } from '../../src/main/agent/llm'
import type { AgentConfig, ChatEvent, PromptResponse, ProviderConnection } from '../../src/shared/types'
import type { AgentAssignmentSnapshot } from '../../src/shared/provider-state'

const BS_AGENT: AgentConfig = {
  id: 'a1', name: 'bs', templateId: 'bs', cwd: '/proj', kind: 'native'
}
// A second native agent, so a fallback candidate exists. Opt-in, because most
// tests here count agents.
const SECOND_AGENT: AgentConfig = {
  id: 'a3', name: 'helper', templateId: 'bs', cwd: '/proj', kind: 'native'
}
const PTY_AGENT: AgentConfig = {
  id: 'a2', name: 'opencode', templateId: 'opencode', cwd: '/proj'
}

interface StubLlmOptions {
  hangUntilAbort?: boolean
  partsQueue?: LlmStreamPart[][]
}

async function makeManager(opts: StubLlmOptions & {
  configPath?: string
  catalog?: ModelsCatalog
  providerAccounts?: ProviderConnection[]
  providerRuntime?: (providerId: string, accountId: string, modelId: string) => LlmClient
  secondAgent?: boolean
} = {}) {
  const cfgDir = mkdtempSync(path.join(tmpdir(), 'bs-mgr-cfg-'))
  const defaultCfg = path.join(cfgDir, 'bs.json')
  if (!opts.configPath) {
    writeFileSync(defaultCfg, JSON.stringify({
      provider: { test: { apiKey: 'sk-test', models: ['test-model'] } },
      model: 'test'
    }))
  }
  const sessions: StoredSession[] = []
  const json: JsonStore<StoredSession> = {
    load: () => sessions,
    save: (next) => sessions.splice(0, sessions.length, ...next)
  }
  const store = new SessionStore(json)
  const snapshotEntries: SnapshotTurn[] = []
  const snapshots = new SnapshotStore({
    load: () => snapshotEntries,
    save: (next) => snapshotEntries.splice(0, snapshotEntries.length, ...next)
  })
  const permEntries: SavedPermission[] = []
  const savedPermissions = new SavedPermissions({
    load: () => permEntries,
    save: (next) => permEntries.splice(0, permEntries.length, ...next)
  })
  const events: ChatEvent[] = []
  const assignmentEvents: AgentAssignmentSnapshot[] = []
  const llmCalls: string[][] = []
  const llmSystems: string[] = []
  const llmVariants: Array<Record<string, unknown> | undefined> = []
  const llmModels: string[] = []
  let llmClient: LlmClient
  // Declaring the parameters is the point: a mock whose signature does not
  // match what it replaces cannot catch a caller passing the wrong thing,
  // and mock.calls types as an empty tuple without them.
  const createLlm = vi.fn((_provider: string, _apiKey: string, _baseUrl?: string): LlmClient => {
    llmClient = {
      async *stream(request: LlmStreamOptions): AsyncGenerator<LlmStreamPart> {
        // A session's first turn is followed by a short request asking the model
        // for a title. In production that is its own request; here it must not
        // consume a queued turn response or read as a turn in these records,
        // which every assertion below reads positionally.
        if (request.system.startsWith('Reply with a short title')) {
          yield { kind: 'text', text: 'A test session' }
          yield { kind: 'finish' }
          return
        }
        llmCalls.push((request.tools ?? []).map(t => t.name))
        llmSystems.push(request.system)
        llmVariants.push(request.variantOptions)
        llmModels.push(request.model)
        if (opts.hangUntilAbort) {
          await new Promise<void>(resolve => {
            if (request.signal?.aborted) return resolve()
            request.signal?.addEventListener('abort', () => resolve(), { once: true })
          })
          yield { kind: 'finish' }
          return
        }
        const parts = (opts.partsQueue ?? []).shift() ??
          [{ kind: 'text', text: 'hi' }, { kind: 'finish' }]
        for (const p of parts) yield p
      }
    }
    return llmClient
  })
  const manager = new BsAgentManager({
    configPath: opts.configPath ?? defaultCfg,
    store,
    snapshots,
    savedPermissions,
    tools: createDefaultTools(),
    createLlm,
    catalog: opts.catalog,
    truncation: new TruncationStore(path.join(cfgDir, 'truncation')),
    commands: new CommandStore(path.join(cfgDir, 'commands.json')),
    prices: { 'test/test-model': { input: 1, output: 2 } },
    env: { ANTHROPIC_API_KEY: 'sk-test' } as NodeJS.ProcessEnv,
    providerAccounts: opts.providerAccounts ? () => opts.providerAccounts! : undefined,
    providerRuntime: opts.providerRuntime,
    onAssignmentChanged: assignment => assignmentEvents.push(assignment)
  })
  manager.setOnEvent(e => events.push(e))
  await manager.init(opts.secondAgent
    ? [{ ...BS_AGENT }, { ...SECOND_AGENT }, { ...PTY_AGENT }]
    : [{ ...BS_AGENT }, { ...PTY_AGENT }])
  return { manager, store, events, assignmentEvents, createLlm, savedPermissions, llmCalls, llmSystems, llmVariants, llmModels }
}

describe('BsAgentManager', () => {
  it('registers native agents and ignores pty agents', async () => {
    const { manager } = await makeManager()
    expect(manager.isNative('a1')).toBe(true)
    expect(manager.isNative('a2')).toBe(false)
  })

  it('tracks and restores background state per agent', async () => {
    const { manager } = await makeManager()
    expect(manager.isBackground('a1')).toBe(false)
    manager.setBackground('a1', true)
    expect(manager.isBackground('a1')).toBe(true)
    manager.setBackground('a1', false)
    expect(manager.isBackground('a1')).toBe(false)
  })

  it('materializes an OAuth-only OpenAI provider for assignment and model selection', async () => {
    const providerAccounts: ProviderConnection[] = [{
      providerId: 'openai',
      activeAccountId: 'oauth-1',
      accounts: [{
        id: 'oauth-1', providerId: 'openai', label: 'plus@example.com', authMode: 'oauth', status: 'active',
        models: ['gpt-5.6-sol'], createdAt: 1, lastUsedAt: 1
      }]
    }]
    const { manager } = await makeManager({ providerAccounts })
    manager.setModel('a1', 'openai', 'gpt-5.6-sol')
    expect(manager.getAgentModel('a1')).toEqual({ provider: 'openai', model: 'gpt-5.6-sol' })
    expect(manager.getAgentAssignment('a1')).toMatchObject({ provider: 'openai', model: 'gpt-5.6-sol', accountId: 'oauth-1' })
    expect(manager.getProviderModels()).not.toContainEqual({ provider: 'openai', model: 'gpt-5.5' })
    expect(manager.getProviderModels()).toContainEqual({ provider: 'openai', model: 'gpt-5.6-sol' })
  })

  it('validates and persists canonical provider account model assignments', async () => {
    const providerAccounts: ProviderConnection[] = [{ providerId: 'test', activeAccountId: 'acct-1', accounts: [{ id: 'acct-1', providerId: 'test', label: 'test', authMode: 'api-key', status: 'active', models: ['test-model'], createdAt: 1, lastUsedAt: 1 }] }]
    const { manager } = await makeManager({ providerAccounts })
    const assignment = manager.setAgentAssignmentSnapshot({ agentId: 'a1', providerId: 'test', accountId: 'acct-1', modelId: 'test-model', speed: 'fast' })
    expect(assignment).toMatchObject({ providerId: 'test', accountId: 'acct-1', modelId: 'test-model', speed: 'fast', status: 'ready' })
    expect(manager.getAgentAssignmentSnapshot('a1')).toEqual(assignment)
    const invalid = manager.setAgentAssignmentSnapshot({ agentId: 'a1', providerId: 'test', accountId: 'missing', modelId: 'missing-model', speed: 'standard' })
    expect(invalid).toMatchObject({ accountId: 'missing', modelId: 'missing-model', status: 'needs-review' })
    expect(manager.getAgentAssignmentSnapshot('a1')).toEqual(invalid)
    expect(manager.getAgentModel('a1')).toBeNull()
  })

  it('does not silently normalize an unsupported OpenAI model to the first code model', async () => {
    const providerAccounts: ProviderConnection[] = [{
      providerId: 'openai', activeAccountId: 'oauth-1', accounts: [{
        id: 'oauth-1', providerId: 'openai', label: 'plus@example.com', authMode: 'oauth', status: 'active',
        models: ['gpt-5.6-sol'], createdAt: 1, lastUsedAt: 1
      }]
    }]
    const { manager } = await makeManager({ providerAccounts })

    const invalid = manager.setAgentAssignmentSnapshot({ agentId: 'a1', providerId: 'openai', accountId: 'oauth-1', modelId: 'gpt-5.5', speed: 'standard' })

    expect(invalid).toMatchObject({ modelId: 'gpt-5.5', status: 'needs-review' })
    expect(manager.getAgentModel('a1')).toBeNull()
  })

  it('chats through an OAuth provider runtime without requiring an API key', async () => {
    const providerAccounts: ProviderConnection[] = [{
      providerId: 'antigravity', activeAccountId: 'oauth-1', accounts: [{
        id: 'oauth-1', providerId: 'antigravity', label: 'pro@example.com', authMode: 'oauth', status: 'active',
        models: ['gemini-code'], createdAt: 1, lastUsedAt: 1
      }]
    }]
    const providerRuntime = vi.fn((): LlmClient => ({
      async *stream() { yield { kind: 'text', text: 'OAuth works' }; yield { kind: 'finish' } }
    }))
    const { manager, events } = await makeManager({ providerAccounts, providerRuntime })
    manager.setAgentAssignmentSnapshot({ agentId: 'a1', providerId: 'antigravity', accountId: 'oauth-1', modelId: 'gemini-code', speed: 'standard' })

    await manager.send('a1', 'hello')

    expect(providerRuntime).toHaveBeenCalledWith('antigravity', 'oauth-1', 'gemini-code')
    expect(events).toContainEqual(expect.objectContaining({ type: 'text-delta', delta: 'OAuth works' }))
    expect(events.some(event => event.type === 'error' && event.message.includes('API key'))).toBe(false)
  })

  it('does not fall back to another active account when the assigned account becomes disabled', async () => {
    const providerAccounts: ProviderConnection[] = [{
      providerId: 'antigravity', activeAccountId: 'account-1', accounts: [
        { id: 'account-1', providerId: 'antigravity', label: 'Assigned', authMode: 'oauth', status: 'active', models: ['gemini-code'], createdAt: 1, lastUsedAt: 1 },
        { id: 'account-2', providerId: 'antigravity', label: 'Other', authMode: 'oauth', status: 'disabled', models: ['gemini-code'], createdAt: 1, lastUsedAt: 1 }
      ]
    }]
    const { manager } = await makeManager({ providerAccounts })
    manager.setAgentAssignmentSnapshot({ agentId: 'a1', providerId: 'antigravity', accountId: 'account-1', modelId: 'gemini-code', speed: 'standard' })
    providerAccounts[0].accounts[0].status = 'disabled'
    providerAccounts[0].accounts[1].status = 'active'
    providerAccounts[0].activeAccountId = 'account-2'

    manager.revalidateAssignments()

    expect(manager.getAgentAssignmentSnapshot('a1')).toMatchObject({ accountId: 'account-1', modelId: 'gemini-code', status: 'error' })
    expect(manager.getAgentAssignment('a1')).toBeNull()
  })

  it('emits the canonical assignment mutation when speed changes', async () => {
    const providerAccounts: ProviderConnection[] = [{ providerId: 'test', activeAccountId: 'acct-1', accounts: [{ id: 'acct-1', providerId: 'test', label: 'test', authMode: 'api-key', status: 'active', models: ['test-model'], createdAt: 1, lastUsedAt: 1 }] }]
    const { manager, assignmentEvents } = await makeManager({ providerAccounts })
    manager.setAgentAssignmentSnapshot({ agentId: 'a1', providerId: 'test', accountId: 'acct-1', modelId: 'test-model', speed: 'standard' })
    assignmentEvents.length = 0

    manager.setSpeed('a1', 'fast')

    expect(assignmentEvents).toHaveLength(1)
    expect(assignmentEvents[0]).toMatchObject({ agentId: 'a1', accountId: 'acct-1', modelId: 'test-model', speed: 'fast', status: 'ready' })
  })

  it('syncs a chat model mutation back to the named Agent profile', async () => {
    const providerAccounts: ProviderConnection[] = [{ providerId: 'test', activeAccountId: 'acct-1', accounts: [{ id: 'acct-1', providerId: 'test', label: 'test', authMode: 'api-key', status: 'active', models: ['test-model', 'test-model-2'], createdAt: 1, lastUsedAt: 1 }] }]
    const { manager } = await makeManager({ providerAccounts })

    manager.setModel('a1', 'test', 'test-model-2')

    expect(manager.getSettings().agents.find(agent => agent.name === 'bs')).toMatchObject({ provider: 'test', accountId: 'acct-1', model: 'test-model-2' })
  })

  it('does not choose models[0] when switching to an incomplete Agent profile', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-profile-review-'))
    const configPath = path.join(dir, 'bs.json')
    writeFileSync(configPath, JSON.stringify({
      provider: { test: { apiKey: 'key', models: ['first-model'] } }, model: 'test',
      agents: { bs: { systemPrompt: 'bs' }, reviewer: { provider: 'test', systemPrompt: 'review' } }
    }))
    const { manager } = await makeManager({ configPath })

    manager.setProfile('a1', 'reviewer')

    expect(manager.getAgentModel('a1')).toBeNull()
    expect(manager.getAgentAssignmentSnapshot('a1')).toMatchObject({ profileName: 'reviewer', modelId: '', status: 'needs-review' })
  })

  it('seeds background state from the stored agent config on register', async () => {
    const { manager } = await makeManager()
    manager.addAgent({ ...BS_AGENT, id: 'a9', background: true })
    expect(manager.isBackground('a9')).toBe(true)
  })

  it('send appends the user message and emits events', async () => {
    const { manager, store, events } = await makeManager()
    await manager.send('a1', 'hello')
    const messages = manager.listMessages('a1')
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(messages[0].text).toBe('hello')
    expect(events.some(e => e.type === 'text-delta')).toBe(true)
    expect(events.some(e => e.type === 'done' && e.reason === 'complete')).toBe(true)
    expect(manager.isRunning('a1')).toBe(false)
  })

  it('emits turn-started when a turn begins, including queued drains', async () => {
    const { manager, events } = await makeManager({ hangUntilAbort: true })
    const first = manager.send('a1', 'first')
    await new Promise(r => setTimeout(r, 20))
    expect(events.some(e => e.type === 'turn-started' && e.agentId === 'a1')).toBe(true)
    // Queue a second message; when the first is stopped the queue drains into a
    // new turn that also signals turn-started so the UI can restore Stop.
    void manager.send('a1', 'second')
    manager.stop('a1')
    await new Promise(r => setTimeout(r, 30))
    const started = events.filter(e => e.type === 'turn-started')
    expect(started.length).toBeGreaterThanOrEqual(2)
    expect(manager.isRunning('a1')).toBe(true)
    manager.stop('a1')
    await first
  })

  it('send() stores images on the user message', async () => {
    const { manager } = await makeManager()
    const img = { id: 'i1', name: 'a.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAA', size: 3 }
    await manager.send('a1', 'look at this', [img])
    const messages = manager.listMessages('a1')
    expect(messages[0].text).toBe('look at this')
    expect(messages[0].images).toEqual([img])
  })

  it('listTranscript returns the full transcript including tool steps', async () => {
    const { manager } = await makeManager({
      partsQueue: [
        [
          { kind: 'text', text: 'reading...' },
          { kind: 'tool-call', toolCallId: 'tc1', toolName: 'read', toolInput: { file_path: 'x' } },
          { kind: 'finish' }
        ],
        [{ kind: 'text', text: 'done' }, { kind: 'finish' }]
      ]
    })
    manager.newSession('a1')
    await manager.send('a1', 'read x')
    const transcript = manager.listTranscript('a1')
    const kinds = transcript.map(t => t.kind)
    expect(kinds).toEqual(['message', 'message', 'tool', 'message'])
    const toolItem = transcript.find(t => t.kind === 'tool')
    expect(toolItem && toolItem.kind === 'tool' ? toolItem.tool.tool : '').toBe('read')
  })

  it('emits an error when no api key is configured', async () => {
    const { manager, events } = await makeManager()
    manager.newSession('a1')
    // rebuild manager without key
    const sessions: StoredSession[] = []
    const store = new SessionStore({ load: () => sessions, save: (n) => sessions.splice(0, sessions.length, ...n) })
    const snapEntries: SnapshotTurn[] = []
    const snapshots = new SnapshotStore({ load: () => snapEntries, save: (n) => snapEntries.splice(0, snapEntries.length, ...n) })
    const permEntries: SavedPermission[] = []
    const savedPermissions = new SavedPermissions({ load: () => permEntries, save: (n) => permEntries.splice(0, permEntries.length, ...n) })
    const evts: ChatEvent[] = []
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'bs-mgr-err-'))
    const m2 = new BsAgentManager({
      configPath: '/nonexistent/bs.json',
      store,
      snapshots,
      savedPermissions,
      tools: createDefaultTools(),
      createLlm: () => ({ async *stream() { yield { kind: 'finish' } } }),
      truncation: new TruncationStore(path.join(tmpDir, 'truncation2')),
      env: {}
    })
    m2.setOnEvent(e => evts.push(e))
    await m2.init([{ ...BS_AGENT }])
    await m2.send('a1', 'hi')
    rmSync(tmpDir, { recursive: true, force: true })
    expect(evts.some(e => e.type === 'error')).toBe(true)
    expect((evts.find(e => e.type === 'error') as Extract<ChatEvent, { type: 'error' }>).message).toContain('[bs]')
  })

  it('stop aborts a running turn and emits done stopped', async () => {
    const { manager, events } = await makeManager({ hangUntilAbort: true })
    const sendPromise = manager.send('a1', 'go')
    await new Promise(r => setTimeout(r, 20))
    expect(manager.isRunning('a1')).toBe(true)
    manager.stop('a1')
    await sendPromise
    expect(events.some(e => e.type === 'done' && e.reason === 'stopped')).toBe(true)
    expect(manager.isRunning('a1')).toBe(false)
  })

  it('queues messages sent while a turn is running and drains them serially', async () => {
    const { manager, events } = await makeManager({
      partsQueue: [
        [
          { kind: 'tool-call', toolCallId: 'tc1', toolName: 'websearch', toolInput: { query: 'q' } },
          { kind: 'finish' }
        ],
        [{ kind: 'text', text: 'r1' }, { kind: 'finish' }],
        [{ kind: 'text', text: 'r2' }, { kind: 'finish' }]
      ]
    })
    manager.newSession('a1')
    const sendPromise = manager.send('a1', 'first')
    // Wait for the first turn to block on a permission prompt.
    await new Promise<void>(resolve => {
      const t = setInterval(() => {
        if (events.some(e => e.type === 'prompt-request')) {
          clearInterval(t)
          resolve()
        }
      }, 5)
    })
    expect(manager.isRunning('a1')).toBe(true)
    await manager.send('a1', 'second')
    await manager.send('a1', 'third')
    const q = manager.listQueued('a1')
    expect(q.map(m => m.text)).toEqual(['second', 'third'])
    expect(events.some(e => e.type === 'queue-updated' && e.queue.length === 2)).toBe(true)
    // Allow the permission prompt → first turn completes → queue drains serially.
    await manager.respondPrompt('a1', events.find(e => e.type === 'prompt-request')!.promptId, { allow: true })
    await sendPromise
    expect(manager.listQueued('a1')).toEqual([])
    const msgs = manager.listMessages('a1').filter(m => m.role === 'user').map(m => m.text)
    expect(msgs).toContain('second')
    expect(msgs).toContain('third')
  })

  it('removeQueued and editQueued update the queue', async () => {
    const { manager, events } = await makeManager({ hangUntilAbort: true })
    const sendPromise = manager.send('a1', 'first')
    await new Promise(r => setTimeout(r, 20))
    await manager.send('a1', 'second')
    const q = manager.listQueued('a1')
    const second = q[0]
    manager.editQueued('a1', second.id, 'second-edited')
    expect(manager.listQueued('a1')[0].text).toBe('second-edited')
    manager.removeQueued('a1', second.id)
    expect(manager.listQueued('a1')).toEqual([])
    expect(events.some(e => e.type === 'queue-updated')).toBe(true)
    // Clear the queue so stop doesn't drain into a hanging turn.
    manager.stop('a1')
    await sendPromise
  })

  it('rejects queuing more than 5 messages', async () => {
    const { manager, events } = await makeManager({ hangUntilAbort: true })
    const sendPromise = manager.send('a1', 'first')
    await new Promise(r => setTimeout(r, 20))
    for (let i = 0; i < 6; i++) await manager.send('a1', `msg ${i}`)
    expect(manager.listQueued('a1')).toHaveLength(5)
    expect(events.some(e => e.type === 'error')).toBe(true)
    // Clear the queue so stop doesn't drain into a hanging turn.
    for (const m of manager.listQueued('a1')) manager.removeQueued('a1', m.id)
    manager.stop('a1')
    await sendPromise
  })

  it('does not resolve an awaited send while the message is still queued', async () => {
    // The whole bug behind a silent worker: send resolves on acceptance, so a
    // caller could not tell "queued" from "finished".
    const { manager } = await makeManager({ hangUntilAbort: true })
    const first = manager.send('a1', 'first')
    await new Promise(r => setTimeout(r, 20))
    let settled = false
    const second = manager.sendAwaited('a1', 'second').then(() => { settled = true })
    await new Promise(r => setTimeout(r, 20))
    expect(manager.listQueued('a1')).toHaveLength(1)
    expect(settled).toBe(false)
    for (const m of manager.listQueued('a1')) manager.removeQueued('a1', m.id)
    manager.stop('a1')
    await Promise.all([first, second])
  })

  it('resolves an awaited send that runs inline', async () => {
    const { manager } = await makeManager({
      partsQueue: [[{ kind: 'text', text: 'done' }, { kind: 'finish' }]]
    })
    await manager.sendAwaited('a1', 'go')
    expect(manager.listMessages('a1').some(m => m.role === 'assistant')).toBe(true)
  })

  it('resolves an awaited send that the queue refuses', async () => {
    // A refusal that never resolved would hang the coordinator exactly as a
    // silent worker does.
    const { manager } = await makeManager({ hangUntilAbort: true })
    const first = manager.send('a1', 'first')
    await new Promise(r => setTimeout(r, 20))
    for (let i = 0; i < 5; i++) await manager.send('a1', `msg ${i}`)
    await manager.sendAwaited('a1', 'refused')
    for (const m of manager.listQueued('a1')) manager.removeQueued('a1', m.id)
    manager.stop('a1')
    await first
  })

  it('resolves an awaited send whose queued message is deleted', async () => {
    const { manager } = await makeManager({ hangUntilAbort: true })
    const first = manager.send('a1', 'first')
    await new Promise(r => setTimeout(r, 20))
    let settled = false
    const pending = manager.sendAwaited('a1', 'doomed').then(() => { settled = true })
    await new Promise(r => setTimeout(r, 20))
    for (const m of manager.listQueued('a1')) manager.removeQueued('a1', m.id)
    await pending
    expect(settled).toBe(true)
    manager.stop('a1')
    await first
  })

  it('resolves an awaited send whose agent is removed', async () => {
    const { manager } = await makeManager({ hangUntilAbort: true })
    const first = manager.send('a1', 'first')
    await new Promise(r => setTimeout(r, 20))
    const pending = manager.sendAwaited('a1', 'orphan')
    await new Promise(r => setTimeout(r, 20))
    manager.removeAgent('a1')
    await pending
    manager.stop('a1')
    await first
  })

  it('respondPrompt allow lets a permission-ask tool run', async () => {
    const { manager: m2, events: evts } = await makeManager({
      partsQueue: [
        [
          { kind: 'tool-call', toolCallId: 'tc1', toolName: 'websearch', toolInput: { query: 'bs' } },
          { kind: 'finish' }
        ],
        [{ kind: 'text', text: 'ok' }, { kind: 'finish' }]
      ]
    })
    m2.newSession('a1')
    const sendPromise = m2.send('a1', 'search web')
    // wait for prompt-request, then allow
    await new Promise<void>(resolve => {
      const t = setInterval(() => {
        const p = evts.find(e => e.type === 'prompt-request') as Extract<ChatEvent, { type: 'prompt-request' }> | undefined
        if (p) {
          clearInterval(t)
          m2.respondPrompt('a1', p.promptId, { allow: true } satisfies PromptResponse)
          resolve()
        }
      }, 5)
    })
    await sendPromise
    const result = evts.find(e => e.type === 'tool-result') as Extract<ChatEvent, { type: 'tool-result' }>
    expect(result).toBeDefined()
    expect(result.call.permission).toBe('allowed')
    expect(result.call.error).toMatch(/TAVILY_API_KEY/)
  })

  it('newSession creates a new empty session and keeps history', async () => {
    const { manager, store } = await makeManager()
    await manager.send('a1', 'x')
    expect(manager.listSessions('a1')).toHaveLength(1)
    const oldId = manager.listSessions('a1')[0].id
    manager.newSession('a1')
    expect(manager.listMessages('a1')).toEqual([])
    expect(manager.listSessions('a1')).toHaveLength(2)
    expect(store.get(oldId)?.items.length).toBeGreaterThan(0)
  })

  it('removeAgent retains attributed project sessions', async () => {
    const { manager, store } = await makeManager()
    await manager.send('a1', 'hello')
    expect(manager.listSessions('a1')).toHaveLength(1)
    manager.removeAgent('a1')
    expect(manager.isNative('a1')).toBe(false)
    expect(manager.listSessions('a1')).toHaveLength(1)
    expect(store.get(manager.listSessions('a1')[0].id)?.items.length).toBeGreaterThan(0)
  })

  it('undo removes the last turn transcript and redo restores it', async () => {
    const { manager, store } = await makeManager()
    // Seed a snapshot turn so undo has history to pop.
    const file = path.join(tmpdir(), 'bs-undo-f.txt')
    writeFileSync(file, 'original')
    const snapshots = (manager as unknown as { deps: { snapshots: import('../../src/main/agent/snapshot').SnapshotStore } }).deps.snapshots
    snapshots.beginTurn('a1')
    snapshots.snapshot('a1', file, 'original')
    snapshots.commitTurn('a1')

    await manager.send('a1', 'first')
    expect(manager.listMessages('a1').map(m => m.role)).toEqual(['user', 'assistant'])
    expect(manager.undo('a1')).toBe(true)
    expect(manager.listMessages('a1')).toEqual([])
    expect(readFileSync(file, 'utf-8')).toBe('original')
    expect(manager.redo('a1')).toBe(true)
    expect(manager.listMessages('a1').map(m => m.role)).toEqual(['user', 'assistant'])
    // redo re-inserts the turn, so another undo works
    expect(manager.redo('a1')).toBe(false)
    expect(manager.undo('a1')).toBe(true)
    rmSync(file, { force: true })
  })

  it('undo returns false when there is no snapshot history', async () => {
    const { manager } = await makeManager()
    manager.newSession('a1')
    expect(manager.undo('a1')).toBe(false)
  })

  it('renameSession updates the title', async () => {
    const { manager } = await makeManager()
    const s = manager.listSessions('a1')[0] ?? manager.newSession('a1')
    const renamed = manager.renameSession('a1', s.id, 'My custom title')
    expect(renamed?.title).toBe('My custom title')
    expect(manager.listSessions('a1')[0].title).toBe('My custom title')
  })

  it('getSettings has no built-in provider presets', async () => {
    const { manager } = await makeManager()
    const s = manager.getSettings()
    expect(s.providers.map(p => p.id)).not.toContain('anthropic')
    expect(s.providers.map(p => p.id)).not.toContain('openai')
    expect(s.providers[0].models).toEqual(['test-model'])
  })

  it('saveSettings writes config and reloads with the new provider/key', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-mgr-'))
    try {
      const configPath = path.join(dir, 'bs.json')
      const { manager, createLlm } = await makeManager({ configPath })
      createLlm.mockClear()
      const saved = await manager.saveSettings({
        ...configToSettings(DEFAULT_BS_CONFIG),
        defaultProvider: 'deepseek',
        providers: [
          { id: 'deepseek', apiKey: 'sk-ds', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat'] }
        ]
      })
      expect(saved.defaultProvider).toBe('deepseek')
      const lastCall = createLlm.mock.calls[createLlm.mock.calls.length - 1]
      expect(lastCall[0]).toBe('deepseek')
      expect(lastCall[1]).toBe('sk-ds')
      expect(lastCall[2]).toBe('https://api.deepseek.com/v1')
      expect(manager.isNative('a1')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('saves settings without creating a provider runtime from an incomplete account assignment', async () => {
    const providerRuntime = vi.fn(() => { throw new Error('provider runtime must not be created') })
    const accounts: ProviderConnection[] = [{
      providerId: 'openai',
      activeAccountId: 'openai-a',
      accounts: [{
        id: 'openai-a', providerId: 'openai', label: 'first@example.com', authMode: 'oauth', status: 'active',
        createdAt: 1, lastUsedAt: 1, models: ['gpt-code'], keyRef: 'account:openai-a'
      }]
    }]
    const { manager } = await makeManager({ providerAccounts: accounts, providerRuntime })
    manager.setAgentAssignmentSnapshot({ agentId: 'a1', providerId: '', accountId: 'openai-a', modelId: '', speed: 'standard' })

    await expect(manager.saveSettings(manager.getSettings())).resolves.toBeDefined()
    expect(providerRuntime).not.toHaveBeenCalled()
  })

  it('plan mode denies a write tool call', async () => {
    const { manager, events } = await makeManager({
      partsQueue: [
        [{ kind: 'tool-call', toolCallId: 'tc1', toolName: 'write', toolInput: { file_path: 'x', content: 'y' } }, { kind: 'finish' }],
        [{ kind: 'text', text: 'ok' }, { kind: 'finish' }]
      ]
    })
    manager.setMode('a1', 'plan')
    await manager.send('a1', 'write x')
    const result = events.find(e => e.type === 'tool-result') as Extract<ChatEvent, { type: 'tool-result' }>
    expect(result.call.permission).toBe('denied')
    expect(result.call.error).toMatch(/not permitted in the current mode/)
  })

  it('leaves plain chat without the shared-session record note', async () => {
    const { manager, llmSystems } = await makeManager()
    await manager.send('a1', 'first')
    // Plain chat builds its context with toLlmMessages and never sees a
    // record, so the note would be advice about something that is not there.
    expect(llmSystems[0]).not.toContain('Session log')
  })

  it('setMode rebuilds the runner system prompt with a plan note', async () => {
    const { manager, llmSystems } = await makeManager({
      partsQueue: [[{ kind: 'text', text: 'a' }, { kind: 'finish' }], [{ kind: 'text', text: 'b' }, { kind: 'finish' }]]
    })
    await manager.send('a1', 'first')
    expect(llmSystems[0]).not.toMatch(/PLAN MODE/)
    manager.setMode('a1', 'plan')
    await manager.send('a1', 'second')
    expect(llmSystems[1]).toMatch(/PLAN MODE/)
  })

  it('setMode while a turn is running applies the new mode to the next turn', async () => {
    const { manager, llmSystems } = await makeManager({
      partsQueue: [
        [{ kind: 'text', text: 'a' }, { kind: 'finish' }],
        [{ kind: 'text', text: 'b' }, { kind: 'finish' }]
      ]
    })
    // send() starts the turn synchronously (running set before any await), so
    // setMode below runs mid-turn — the common "switch mode during chat" case.
    const first = manager.send('a1', 'first')
    expect(manager.isRunning('a1')).toBe(true)
    manager.setMode('a1', 'plan')
    await first
    expect(llmSystems[0]).not.toMatch(/PLAN MODE/)
    await manager.send('a1', 'second')
    expect(llmSystems[1]).toMatch(/PLAN MODE/)
  })

  it('setVariant passes a clamped variant descriptor to the llm stream', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-var-stream-'))
    try {
      const cfgPath = path.join(dir, 'bs.json')
      writeFileSync(cfgPath, JSON.stringify({
        provider: { test: { apiKey: 'sk-test', models: ['test-model'] } },
        model: 'test'
      }))
      const catalog = new ModelsCatalog(path.join(dir, 'models.json'), async () =>
        ({ ok: true, json: async () => ({
          test: {
            name: 'Test',
            npm: '@ai-sdk/openai-compatible',
            models: {
              'test-model': { reasoning: true, reasoning_options: [{ type: 'effort', values: ['low', 'high'] }] }
            }
          }
        }) }) as unknown as Response)
      const { manager, llmVariants } = await makeManager({ configPath: cfgPath, catalog })
      await manager.send('a1', 'first')
      expect(llmVariants[0]).toBeUndefined()
      manager.setVariant('a1', 'high')
      await manager.send('a1', 'second')
      expect(llmVariants[1]).toEqual({ openaiCompatible: { reasoningEffort: 'high' } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('setVariant clamps an out-of-allow value to undefined', async () => {
    const { manager } = await makeManager()
    await manager.send('a1', 'first')
    manager.setVariant('a1', 'xhigh')
    const stored = manager.getVariant('a1')
    expect(stored).toBeUndefined()
  })

  it('setVariant keeps an allow-listed value', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-var-'))
    try {
      const cfgPath = path.join(dir, 'bs.json')
      writeFileSync(cfgPath, JSON.stringify({
        provider: { test: { apiKey: 'sk-test', models: ['test-model'] } },
        model: 'test'
      }))
      const catalog = new ModelsCatalog(path.join(dir, 'models.json'), async () =>
        ({ ok: true, json: async () => ({
          test: {
            name: 'Test',
            npm: '@ai-sdk/openai-compatible',
            models: {
              'test-model': { reasoning: true, reasoning_options: [{ type: 'effort', values: ['low', 'medium', 'high'] }] }
            }
          }
        }) }) as unknown as Response)
      const { manager } = await makeManager({ configPath: cfgPath, catalog })
      await manager.send('a1', 'first')
      manager.setVariant('a1', 'low')
      expect(manager.getVariant('a1')).toBe('low')
      manager.setVariant('a1', 'max')
      expect(manager.getVariant('a1')).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('connectProvider syncs models and baseUrl from the catalog', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-conn-'))
    try {
      const catalog = new ModelsCatalog(path.join(dir, 'models.json'), async () =>
        ({ ok: true, json: async () => ({
          deepseek: { name: 'DeepSeek', api: 'https://api.deepseek.com', models: { 'deepseek-chat': {}, 'deepseek-reasoner': {} } }
        }) }) as unknown as Response)
      const { manager } = await makeManager({ configPath: path.join(dir, 'bs.json'), catalog })
      const settings = await manager.connectProvider('deepseek', 'sk-ds')
      expect(settings.providers).toHaveLength(1)
      expect(settings.providers[0]).toMatchObject({
        id: 'deepseek', apiKey: 'sk-ds', baseUrl: 'https://api.deepseek.com',
        models: ['deepseek-chat', 'deepseek-reasoner']
      })
      expect(settings.defaultProvider).toBe('deepseek')
      const catalogList = await manager.listProviderCatalog()
      expect(catalogList.find(c => c.id === 'deepseek')).toMatchObject({ id: 'deepseek', modelCount: 2 })
      expect(catalogList.find(c => c.id === 'openai')).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('disconnectProvider removes a provider and fixes the default', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-conn-'))
    try {
      const catalog = new ModelsCatalog(path.join(dir, 'models.json'), async () =>
        ({ ok: true, json: async () => ({
          deepseek: { name: 'DeepSeek', api: 'https://api.deepseek.com', models: { a: {} } },
          openai: { name: 'OpenAI', api: 'https://api.openai.com/v1', models: { b: {} } }
        }) }) as unknown as Response)
      const { manager } = await makeManager({ configPath: path.join(dir, 'bs.json'), catalog })
      await manager.connectProvider('deepseek', 'sk-ds')
      await manager.connectProvider('openai', 'sk-oa')
      const settings = await manager.disconnectProvider('deepseek')
      expect(settings.providers.map(p => p.id)).toEqual(['openai'])
      expect(settings.defaultProvider).toBe('openai')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('executes multiple allow tool calls in a turn in parallel', async () => {
    const { manager, events } = await makeManager({
      partsQueue: [
        [
          { kind: 'tool-call', toolCallId: 'tc1', toolName: 'read', toolInput: { file_path: 'a' } },
          { kind: 'tool-call', toolCallId: 'tc2', toolName: 'read', toolInput: { file_path: 'b' } },
          { kind: 'finish' }
        ],
        [{ kind: 'text', text: 'ok' }, { kind: 'finish' }]
      ]
    })
    await manager.send('a1', 'read two files')
    const results = events.filter(e => e.type === 'tool-result')
    expect(results).toHaveLength(2)
    expect(results.map(r => r.call.tool)).toEqual(['read', 'read'])
  })

  it('plan mode hides write tools from the model', async () => {
    const { manager, llmCalls } = await makeManager({
      partsQueue: [[{ kind: 'text', text: 'hi' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'plan')
    await manager.send('a1', 'hi')
    const names = llmCalls[0] ?? []
    expect(names).toContain('read')
    expect(names).not.toContain('write')
    expect(names).not.toContain('edit')
    expect(names).not.toContain('apply-patch')
  })

  it('always allow saves the permission for the next turn', async () => {
    const { manager, events } = await makeManager({
      partsQueue: [
        [{ kind: 'tool-call', toolCallId: 'tc1', toolName: 'bash', toolInput: { command: 'echo hi' } }, { kind: 'finish' }],
        [{ kind: 'text', text: 'done' }, { kind: 'finish' }],
        [{ kind: 'tool-call', toolCallId: 'tc2', toolName: 'bash', toolInput: { command: 'echo hi' } }, { kind: 'finish' }],
        [{ kind: 'text', text: 'done2' }, { kind: 'finish' }]
      ]
    })
    manager.newSession('a1')

    const first = manager.send('a1', 'run bash')
    await new Promise<void>(resolve => {
      const t = setInterval(() => {
        const p = events.find(e => e.type === 'prompt-request') as Extract<ChatEvent, { type: 'prompt-request' }> | undefined
        if (p) {
          clearInterval(t)
          manager.respondPrompt('a1', p.promptId, { allow: true, always: true })
          resolve()
        }
      }, 5)
    })
    await first
    expect(events.some(e => e.type === 'prompt-request')).toBe(true)

    events.length = 0
    await manager.send('a1', 'run bash again')
    expect(events.some(e => e.type === 'prompt-request')).toBe(false)
    const result = events.find(e => e.type === 'tool-result') as Extract<ChatEvent, { type: 'tool-result' }>
    expect(result.call.permission).toBe('allowed')
  })

  it('plan mode still prompts for bash even with a saved always-allow', async () => {
    const { manager, events, savedPermissions } = await makeManager({
      partsQueue: [
        [{ kind: 'tool-call', toolCallId: 'tc1', toolName: 'bash', toolInput: { command: 'echo hi' } }, { kind: 'finish' }]
      ]
    })
    savedPermissions.save('/proj', 'bash')
    manager.setMode('a1', 'plan')

    const run = manager.send('a1', 'run bash')
    await new Promise<void>(resolve => {
      const t = setInterval(() => {
        if (events.some(e => e.type === 'prompt-request')) {
          clearInterval(t)
          resolve()
        }
      }, 5)
    })
    expect(events.some(e => e.type === 'prompt-request')).toBe(true)
    manager.stop('a1')
    await run
    const result = events.find(e => e.type === 'tool-result') as Extract<ChatEvent, { type: 'tool-result' }>
    expect(result.call.permission).toBe('denied')
  })

  it('lists built-in commands and runs one via the runner', async () => {
    const { manager, events } = await makeManager()
    const list = manager.listCommands('/proj')
    expect(list.map(c => c.name)).toContain('init')
    const p = manager.runCommand('a1', 'init', '')
    await new Promise(r => setTimeout(r, 20))
    // command sends a message to the agent → running then done
    expect(manager.isRunning('a1')).toBe(false)
    await p
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('stores the raw slash input as displayText while the resolved prompt reaches the LLM', async () => {
    const { manager, events } = await makeManager()
    await manager.runCommand('a1', 'init', 'custom arg')
    const echo = events.find(e => e.type === 'user-message') as Extract<ChatEvent, { type: 'user-message' }>
    expect(echo.message.displayText).toBe('/init custom arg')
    expect(echo.message.text).toContain('Create an AGENTS.md file for this project')
    // The resolved prompt is what gets persisted and later sent to the model.
    const stored = manager.listMessages('a1').find(m => m.role === 'user')
    expect(stored?.text).toBe(echo.message.text)
  })

  it('sp-brainstorming bubble shows the raw slash input, not the resolved template', async () => {
    const { manager, events } = await makeManager()
    expect(manager.listCommands('/proj').map(c => c.name)).toContain('sp-brainstorming')
    await manager.runCommand('a1', 'sp-brainstorming', 'tôi test')
    const echo = events.find(e => e.type === 'user-message') as Extract<ChatEvent, { type: 'user-message' }>
    expect(echo.message.displayText).toBe('/sp-brainstorming tôi test')
    expect(echo.message.text).toContain('Use the Superpowers skill `brainstorming`')
    expect(echo.message.text).toContain('User request:')
    expect(echo.message.text).toContain('tôi test')
    // Renderer shows displayText ?? text → the raw slash input.
    expect(echo.message.displayText ?? echo.message.text).toBe('/sp-brainstorming tôi test')
  })

  it('queues displayText alongside the resolved text when a turn is running', async () => {
    const { manager, events } = await makeManager({ hangUntilAbort: true })
    const run = manager.send('a1', 'first')
    await new Promise<void>(resolve => {
      const t = setInterval(() => {
        if (events.some(e => e.type === 'turn-started')) {
          clearInterval(t)
          resolve()
        }
      }, 5)
    })
    manager.send('a1', 'Create an AGENTS.md file for this project', undefined, '/init queued')
    const queued = manager.listQueued('a1')
    expect(queued[0]?.displayText).toBe('/init queued')
    expect(queued[0]?.text).toContain('Create an AGENTS.md')
    // Stopping turn 1 drains the queue into a new hanging turn; stop again to release it.
    manager.stop('a1')
    await new Promise(r => setTimeout(r, 30))
    manager.stop('a1')
    await run
  })

  it('runs /new as a system command that creates a new session without calling the LLM', async () => {
    const { manager, events, createLlm } = await makeManager()
    expect(manager.listCommands('/proj').map(c => c.name)).toContain('new')
    const before = manager.listSessions('a1')[0]?.id
    createLlm.mockClear()
    await manager.runCommand('a1', 'new', '')
    const after = manager.listSessions('a1')[0]?.id
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
    expect(events.some(e => e.type === 'session-created')).toBe(true)
    expect(createLlm).not.toHaveBeenCalled()
    expect(events.some(e => e.type === 'done')).toBe(false)
  })

  it('reports cost in the done event and accumulates session usage', async () => {
    const { manager, events, store } = await makeManager({
      partsQueue: [[{ kind: 'text', text: 'hi' }, { kind: 'finish', tokens: { input: 1000, output: 500, total: 1500 } }]]
    })
    manager.newSession('a1')
    await manager.send('a1', 'hello')
    const done = events.find(e => e.type === 'done') as Extract<ChatEvent, { type: 'done' }>
    expect(done.cost).toBeGreaterThan(0)
    const sessionId = manager.listSessions('a1')[0].id
    const usage = store.get(sessionId)?.usage
    expect(usage?.input).toBe(1000)
    expect(usage?.cost).toBeCloseTo(done.cost ?? 0, 10)
  })

  it('getContextInfo reports the config limit and the auto-compact threshold', async () => {
    const { manager } = await makeManager()
    const info = manager.getContextInfo('a1')
    // config mặc định: maxContextTokens 128000, compaction.auto true, buffer 20000
    expect(info.limit).toBe(128000)
    expect(info.compactThreshold).toBe(108000)
    expect(info.sessionCost).toBe(0)
  })

  it('getContextInfo returns nulls for an unknown agent', async () => {
    const { manager } = await makeManager()
    expect(manager.getContextInfo('nope')).toEqual({ limit: null, compactThreshold: null, sessionCost: 0 })
  })

  it('emits a usage event with the accumulated session cost', async () => {
    const { manager, events } = await makeManager({
      partsQueue: [[
        { kind: 'text', text: 'hi' },
        { kind: 'finish', tokens: { input: 1_000_000, output: 1_000_000, total: 2_000_000, cacheRead: 500_000 } }
      ]]
    })
    await manager.send('a1', 'hello')
    const usage = events.find(e => e.type === 'usage')
    expect(usage).toBeDefined()
    expect(usage?.type === 'usage' && usage.tokens.total).toBe(2_000_000)
    // giá test: input 1 $/M, output 2 $/M → 1 + 2 = 3 (cacheRead không có giá → 0)
    expect(usage?.type === 'usage' && usage.sessionCost).toBeCloseTo(3, 10)
    // "in" hiển thị gộp cache-read để khớp prompt_tokens của provider dashboard
    expect(usage?.type === 'usage' && usage.sessionTokens.input).toBe(1_500_000)
    expect(usage?.type === 'usage' && usage.sessionTokens.output).toBe(1_000_000)
  })

  it('getStats aggregates usage across sessions', async () => {
    const { manager } = await makeManager({
      partsQueue: [
        [{ kind: 'text', text: 'a' }, { kind: 'finish', tokens: { input: 500, output: 300, total: 800, cacheRead: 200 } }],
        [{ kind: 'text', text: 'b' }, { kind: 'finish', tokens: { input: 200, output: 100, total: 300 } }]
      ]
    })
    await manager.send('a1', 'first')
    manager.newSession('a1')
    await manager.send('a1', 'second')
    const stats = manager.getStats()
    // totalTokens gồm cache-read (500+300+200) + (200+100) = 1300
    expect(stats.totalTokens).toBe(1300)
    expect(stats.totalCost).toBeGreaterThan(0)
    expect(stats.perModel['test-model']).toBeDefined()
    expect(stats.perModel['test-model'].tokens).toBe(1300)
    expect(stats.perSession).toHaveLength(2)
  })

  it('task tool resolves a configured subagent model to a dedicated llm', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-subagent-'))
    try {
      const configPath = path.join(dir, 'bs.json')
      writeFileSync(configPath, JSON.stringify({
        provider: {
          test: { apiKey: 'sk-test', models: ['test-model'] },
          p1: { apiKey: 'sk-p1', models: ['m1', 'm2'] }
        },
        model: 'test',
        subagentModels: { research: { provider: 'p1', model: 'm2' } }
      }))
      const { manager, llmModels, createLlm } = await makeManager({
        configPath,
        partsQueue: [
          [
            { kind: 'tool-call', toolCallId: 'tc1', toolName: 'task', toolInput: { description: 'research x', prompt: 'research x', subagent_type: 'research' } },
            { kind: 'finish' }
          ],
          [{ kind: 'text', text: 'sub result' }, { kind: 'finish' }],
          [{ kind: 'text', text: 'done' }, { kind: 'finish' }]
        ]
      })
      manager.newSession('a1')
      await manager.send('a1', 'research x')
      // The subagent ran on a dedicated p1 client using the configured m2 model.
      expect(createLlm.mock.calls.some(c => c[0] === 'p1' && c[1] === 'sk-p1')).toBe(true)
      expect(llmModels).toContain('m2')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('task tool falls back to the main model when the subagent provider has no api key', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-subagent-'))
    try {
      const configPath = path.join(dir, 'bs.json')
      writeFileSync(configPath, JSON.stringify({
        provider: {
          test: { apiKey: 'sk-test', models: ['test-model'] },
          p1: { apiKeyEnv: 'BS_UNSET_KEY', models: ['m1', 'm2'] }
        },
        model: 'test',
        subagentModels: { research: { provider: 'p1', model: 'm2' } }
      }))
      const { manager, llmModels, createLlm } = await makeManager({
        configPath,
        partsQueue: [
          [
            { kind: 'tool-call', toolCallId: 'tc1', toolName: 'task', toolInput: { description: 'research x', prompt: 'research x', subagent_type: 'research' } },
            { kind: 'finish' }
          ],
          [{ kind: 'text', text: 'sub result' }, { kind: 'finish' }],
          [{ kind: 'text', text: 'done' }, { kind: 'finish' }]
        ]
      })
      manager.newSession('a1')
      await manager.send('a1', 'research x')
      // No dedicated subagent client: the task tool inherits the main model/llm.
      expect(createLlm.mock.calls.some(c => c[0] === 'p1')).toBe(false)
      expect(llmModels.every(m => m === 'test-model')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('agent fallback', () => {
  it('continues a turn on another agent when quota is refused', async () => {
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [
        [{ kind: 'error', error: '[bs] [request-failed] Antigravity request failed (429): Individual quota reached' }],
        [{ kind: 'text', text: 'carried on' }, { kind: 'finish' }]
      ]
    })
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(true)
    expect(events.filter(event => event.type === 'error')).toEqual([])
  })

  it('does not hand over an auth failure', async () => {
    // Falling back on a malformed or unauthorised request just repeats it
    // somewhere else.
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'error', error: '[bs] [request-failed] request failed (401): Unauthorized' }]]
    })
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(false)
    expect(events.some(event => event.type === 'error')).toBe(true)
  })

  it('ends the turn when there is no one to hand to', async () => {
    const { manager, events } = await makeManager({
      partsQueue: [[{ kind: 'error', error: '[bs] [request-failed] request failed (429): quota' }]]
    })
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'error')).toBe(true)
  })
})

describe('delegation keeps conversations separate', () => {
  it('runs the assigned turn in the target agent session, not the coordinator one', async () => {
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'worker done' }, { kind: 'finish' }]]
    })
    const before = manager.listMessages('a1').length
    // This is what the delegate tool does underneath: a normal turn on the
    // target agent, in that agent's own session.
    await manager.send('a3', 'do the thing')
    expect(manager.listMessages('a3').some(message => message.text.includes('worker done'))).toBe(true)
    expect(manager.listMessages('a1')).toHaveLength(before)
  })
})

describe('coordination assignments', () => {
  // runAssignment is private and its only production caller is the delegate
  // tool's closure. Casting here rather than adding a method to production
  // whose only caller would be this test.
  const delegate = (manager: BsAgentManager, from: string, to: string, task: string) =>
    (manager as unknown as { runAssignment: (c: string, n: string, t: string) => Promise<unknown> })
      .runAssignment(from, to, task)

  it('records an assignment while the worker runs, not after', async () => {
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'worker done' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'coordinate')
    const running = delegate(manager, 'a1', 'helper', 'do the thing')
    // Asserted before the await: the view exists to show work in flight, and a
    // record written only on completion would never show anything running.
    expect(manager.listAssignments('a1')[0]?.state).toBe('running')
    await running
    const done = manager.listAssignments('a1')[0]
    expect(done.state).toBe('completed')
    expect(done.result).toContain('worker done')
  })

  it('marks a failed assignment failed', async () => {
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'error', error: 'boom' }]]
    })
    manager.setMode('a1', 'coordinate')
    await delegate(manager, 'a1', 'helper', 'x')
    expect(manager.listAssignments('a1')[0].state).toBe('failed')
  })

  it('emits both edges', async () => {
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'ok' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'coordinate')
    await delegate(manager, 'a1', 'helper', 'x')
    expect(events.some(event => event.type === 'assignment-started')).toBe(true)
    expect(events.some(event => event.type === 'assignment-finished')).toBe(true)
  })
})

describe('stopping a fan-out', () => {
  const delegate = (manager: BsAgentManager, from: string, to: string, task: string) =>
    (manager as unknown as { runAssignment: (c: string, n: string, t: string) => Promise<unknown> })
      .runAssignment(from, to, task)
  const settle = () => new Promise(resolve => setTimeout(resolve, 15))

  it('stops the workers a coordinating turn started', async () => {
    const { manager } = await makeManager({ secondAgent: true, hangUntilAbort: true })
    manager.setMode('a1', 'coordinate')
    void delegate(manager, 'a1', 'helper', 'long job')
    await settle()
    manager.stop('a1')
    await settle()
    expect(manager.isRunning('a3')).toBe(false)
  })

  it('does not resolve a shared name to the coordinator itself', async () => {
    // Agent names are not unique. Before this, a coordinator named the same as
    // a worker resolved to itself and assigned its own turn to itself — and
    // the tests above passed while measuring exactly that.
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'done' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'coordinate')
    const result = await delegate(manager, 'a1', 'bs', 'x') as { error?: string }
    expect(result.error).toContain('No agent named bs')
    expect(manager.listAssignments('a1')).toHaveLength(0)
  })

  it('leaves a worker running for something else alone', async () => {
    // The cascade follows assignments, not agents. A worker busy with its own
    // conversation is not part of this fan-out.
    const { manager } = await makeManager({ secondAgent: true, hangUntilAbort: true })
    manager.setMode('a1', 'coordinate')
    void manager.send('a3', 'its own work')
    await settle()
    manager.stop('a1')
    await settle()
    expect(manager.isRunning('a3')).toBe(true)
  })
})

describe('fallback stays in the same mode', () => {
  it('does not hand a build turn to an agent in another mode', async () => {
    // Not a coordinate special case: a plan-mode agent is denied every write
    // tool, so it could never carry a build turn either. This has been wrong
    // since plan mode existed.
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'error', error: '[bs] [request-failed] (429): quota' }]]
    })
    manager.setMode('a3', 'plan')
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(false)
    expect(events.some(event => event.type === 'error')).toBe(true)
  })

  it('still hands over to an agent in the same mode', async () => {
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [
        [{ kind: 'error', error: '[bs] [request-failed] (429): quota' }],
        [{ kind: 'text', text: 'carried on' }, { kind: 'finish' }]
      ]
    })
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(true)
  })

  it('does not hand a coordinator turn to a worker', async () => {
    // A worker has no delegate tool, so it would do the work rather than
    // assign it — the opposite of what the turn was for.
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'error', error: '[bs] [request-failed] (429): quota' }]]
    })
    manager.setMode('a1', 'coordinate')
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(false)
  })
})

describe('the coordinator knows its role and its workers', () => {
  it('tells a coordinator who its workers are and what they run', async () => {
    const { manager, llmSystems } = await makeManager({ secondAgent: true })
    manager.setMode('a1', 'coordinate')
    await manager.send('a1', 'go')
    const system = llmSystems[0]
    expect(system).toContain('coordinator')
    expect(system).toContain('helper')
    expect(system).toContain('test-model')
  })

  it('leaves a non-coordinator alone', async () => {
    const { manager, llmSystems } = await makeManager({ secondAgent: true })
    await manager.send('a1', 'go')
    expect(llmSystems[0]).not.toContain('coordinator')
  })

  it('does not offer a coordinator another coordinator as a worker', async () => {
    const { manager, llmSystems } = await makeManager({ secondAgent: true })
    manager.setMode('a1', 'coordinate')
    manager.setMode('a3', 'coordinate')
    await manager.send('a1', 'go')
    expect(llmSystems[0]).not.toContain('helper')
  })

  it('reflects a mode changed after the runner was built', async () => {
    // The case modeNote would get wrong: runners are cached per agent, so a
    // roster baked in at build time goes stale the moment anything changes.
    const { manager, llmSystems } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'a' }, { kind: 'finish' }], [{ kind: 'text', text: 'b' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'coordinate')
    await manager.send('a1', 'first')
    manager.setMode('a3', 'coordinate')
    await manager.send('a1', 'second')
    expect(llmSystems[0]).toContain('helper')
    expect(llmSystems[1]).not.toContain('helper')
  })
})

describe('the delegated task is framed', () => {
  const delegate = (manager: BsAgentManager, from: string, to: string, task: string) =>
    (manager as unknown as { runAssignment: (c: string, n: string, t: string) => Promise<unknown> })
      .runAssignment(from, to, task)

  it('asks the worker to carry it out and report rather than redesign', async () => {
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'done' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'coordinate')
    await delegate(manager, 'a1', 'helper', 'change the readme heading')
    const sent = manager.listMessages('a3').find(message => message.role === 'user')
    expect(sent?.text).toContain('change the readme heading')
    // Reporting a failure is part of the job; redesigning around it is not,
    // because the coordinator holds the context that judgement would need.
    expect(sent?.text).toContain('report back')
  })
})
