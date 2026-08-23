import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ProviderManager } from '../../src/main/connections/manager'
import { ProviderRegistry } from '../../src/main/providers/registry'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { AssignmentStore, fileAssignmentPersistence } from '../../src/main/agent/assignments'

function fakeVault() {
  const secrets = new Map<string, string>()
  return { saveSecret: (ref: string, value: string) => secrets.set(ref, value), getSecret: (ref: string) => secrets.get(ref) ?? null, deleteSecret: (ref: string) => secrets.delete(ref) }
}

describe('provider account → assignment → chat integration', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hydrates an OAuth model, restores its assignment, and streams through Cloud Code', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes('fetchAvailableModels')) return new Response(JSON.stringify({ models: { m: { model: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro (Low)', quotaInfo: { remainingFraction: 0.5 } } } }), { status: 200, headers: { 'content-type': 'application/json' } })
      const event = `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'hello from Antigravity' }] }, finishReason: 'STOP' }] } })}\n\n`
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(event)); controller.close() } }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }))
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-provider-chat-'))
    const registry = new ProviderRegistry()
    registry.register(createAntigravityAdapter())
    const manager = new ProviderManager({ accountsFile: path.join(dir, 'accounts.json'), registry, vault: fakeVault() as never })
    const account = manager.store.upsert({ providerId: 'antigravity', label: 'pro@example.com', authMode: 'oauth', status: 'active' }, { accessToken: 'ya29.test', refreshToken: 'refresh' })
    await manager.refreshModels('antigravity', account.id)
    expect(manager.store.get(account.id)?.models).toEqual(['gemini-3.1-pro-low'])

    const assignmentFile = path.join(dir, 'assignments.json')
    new AssignmentStore(fileAssignmentPersistence(assignmentFile)).set({ agentId: 'agent-1', providerId: 'antigravity', accountId: account.id, modelId: 'gemini-3.1-pro-low', speed: 'standard', status: 'ready' })
    const restored = new AssignmentStore(fileAssignmentPersistence(assignmentFile)).get('agent-1')!
    const runtime = manager.createRuntime(restored.providerId, restored.accountId!, restored.modelId)
    const parts = []
    for await (const part of runtime.stream({ model: restored.modelId, system: 'You code.', messages: [{ role: 'user', content: 'hi' }], tools: [] })) parts.push(part)
    expect(parts).toContainEqual({ kind: 'text', text: 'hello from Antigravity' })
    expect(calls.some(url => url.includes('streamGenerateContent'))).toBe(true)
    expect(calls.some(url => url.includes('api.openai.com'))).toBe(false)
  })
})
