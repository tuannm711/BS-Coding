import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { BsAgentManager } from '../../src/main/bs-agent-manager'
import { SessionStore, type StoredSession } from '../../src/main/agent/session'
import { SnapshotStore, type SnapshotEntry } from '../../src/main/agent/snapshot'
import { SavedPermissions, type SavedPermission } from '../../src/main/agent/saved-permissions'
import { TruncationStore } from '../../src/main/agent/truncation'
import { CommandStore } from '../../src/main/agent/commands'
import { createDefaultTools } from '../../src/main/agent/tools/registry'
import type { ChatEvent } from '../../src/shared/types'
import type { JsonStore } from '../../src/main/json-store'

function fakeVault() {
  const secrets = new Map<string, string>()
  return { saveSecret: (ref: string, value: string) => secrets.set(ref, value), getSecret: (ref: string) => secrets.get(ref) ?? null, deleteSecret: (ref: string) => secrets.delete(ref) }
}

function memoryStore<T>(): JsonStore<T> {
  const values: T[] = []
  return { load: () => values, save: next => values.splice(0, values.length, ...next) }
}

function createBsManager(dir: string, providers: ProviderManager, events: ChatEvent[]) {
  const manager = new BsAgentManager({
    configPath: path.join(dir, 'bs.json'),
    assignmentPath: path.join(dir, 'assignments.json'),
    store: new SessionStore(memoryStore<StoredSession>()),
    snapshots: new SnapshotStore(memoryStore<SnapshotEntry>()),
    savedPermissions: new SavedPermissions(memoryStore<SavedPermission>()),
    truncation: new TruncationStore(path.join(dir, 'truncation')),
    commands: new CommandStore(path.join(dir, 'commands.json')),
    tools: createDefaultTools(),
    providerAccounts: () => providers.list(),
    providerRuntime: (providerId, accountId, modelId) => providers.createRuntime(providerId, accountId, modelId)
  })
  manager.setOnEvent(event => events.push(event))
  return manager
}

describe('OAuth → account → assignment → restart → chat integration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('authorizes Antigravity, persists the exact assignment, restarts, and chats through Cloud Code', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'ya29.test', refresh_token: 'refresh', expires_in: 3600 }), { status: 200 })
      if (url.includes('googleapis.com/oauth2/v2/userinfo')) return new Response(JSON.stringify({ email: 'pro@example.com', name: 'Pro User' }), { status: 200 })
      if (url.includes('loadCodeAssist')) return new Response(JSON.stringify({ cloudaicompanionProject: 'project-123', paidTier: { id: 'PRO' } }), { status: 200 })
      if (url.includes('fetchAvailableModels')) return new Response(JSON.stringify({ models: { m: { model: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro (Low)', quotaInfo: { remainingFraction: 0.5 } } } }), { status: 200 })
      const event = `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'hello from Antigravity' }] }, finishReason: 'STOP' }] } })}\n\n`
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(event)); controller.close() } }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }))
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-provider-chat-'))
    const registry = new ProviderRegistry()
    registry.register(createAntigravityAdapter())
    const vault = fakeVault()
    const openExternal = vi.fn()
    let accountReady!: () => void
    const connected = new Promise<void>(resolve => { accountReady = resolve })
    const providers = new ProviderManager({
      accountsFile: path.join(dir, 'accounts.json'),
      registry,
      vault: vault as never,
      openExternal,
      onAccountsChanged: connections => {
        if (connections.some(connection => connection.providerId === 'antigravity' && connection.accounts.some(account => account.models?.includes('gemini-3.1-pro-low')))) accountReady()
      }
    })

    const authorization = await providers.createAuthorization({ providerId: 'antigravity', methodId: 'oauth' })
    expect(openExternal).not.toHaveBeenCalled()
    const auth = new URL(authorization.authUrl)
    const callback = `http://127.0.0.1:1457/auth/callback?code=oauth-code&state=${encodeURIComponent(auth.searchParams.get('state') ?? '')}`
    get(callback).on('error', () => {})
    await connected
    const account = providers.list('antigravity')[0].accounts[0]
    expect(providers.store.getSecret(account.id)).toMatchObject({ projectId: 'project-123', planName: 'PRO' })
    writeFileSync(path.join(dir, 'bs.json'), JSON.stringify({
      provider: {}, model: '', agents: { reviewer: { provider: 'antigravity', accountId: account.id, model: 'gemini-3.1-pro-low', speed: 'fast', systemPrompt: 'You code.' } }
    }))

    const firstEvents: ChatEvent[] = []
    const first = createBsManager(dir, providers, firstEvents)
    const agent = { id: 'agent-1', name: 'reviewer', templateId: 'bs', cwd: dir, kind: 'native' as const }
    await first.init([agent])
    expect(first.getAgentAssignmentSnapshot(agent.id)).toMatchObject({ accountId: account.id, modelId: 'gemini-3.1-pro-low', speed: 'fast', status: 'ready' })
    await first.dispose()

    const restartedProviders = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: vault as never })
    const restartedEvents: ChatEvent[] = []
    const restarted = createBsManager(dir, restartedProviders, restartedEvents)
    await restarted.init([agent])
    expect(restarted.getAgentAssignmentSnapshot(agent.id)).toMatchObject({ accountId: account.id, modelId: 'gemini-3.1-pro-low', speed: 'fast', status: 'ready' })
    await restarted.send(agent.id, 'hi')

    expect(restartedEvents).toContainEqual(expect.objectContaining({ type: 'text-delta', delta: 'hello from Antigravity' }))
    expect(calls.some(url => url.includes('oauth2.googleapis.com/token'))).toBe(true)
    expect(calls.some(url => url.includes('streamGenerateContent'))).toBe(true)
    expect(calls.some(url => url.includes('api.openai.com'))).toBe(false)
    await restarted.dispose()
  })
})
