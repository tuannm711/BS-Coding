import { describe, expect, it } from 'vitest'
import type { AgentSettings } from '../../src/shared/types'
import type { ProviderSnapshot } from '../../src/shared/provider-state'
import { agentModelOptions, assignmentRequestForAgent, connectedProviderOptions, hydrateAgentsFromAssignments } from '../../src/renderer/src/components/settings/AgentsTab'

const snapshot: ProviderSnapshot = {
  revision: 4,
  updatedAt: 4,
  providers: [{ id: 'antigravity', displayName: 'Antigravity IDE', description: '', methods: [], capabilities: { modelDiscovery: 'remote', runtime: 'custom', usage: 'supported' } }],
  accounts: [{ id: 'account-1', providerId: 'antigravity', label: 'Pro', authMode: 'oauth', status: 'active', models: [{ id: 'model-a', name: 'Model A', discoveredAt: 2 }, { id: 'model-b', name: 'Model B', discoveredAt: 2 }], updatedAt: 2 }],
  assignments: [],
}

describe('Agents settings assignment view', () => {
  it('builds provider choices only from connected snapshot accounts', () => {
    expect(connectedProviderOptions(snapshot).map(provider => provider.id)).toEqual(['antigravity'])
  })

  it('keeps the exact non-first saved model selected after reopen', () => {
    const agent: AgentSettings = { name: 'reviewer', systemPrompt: '', provider: 'antigravity', accountId: 'account-1', model: 'model-b', speed: 'fast' }
    expect(agentModelOptions(agent, snapshot)).toEqual([
      { id: 'model-a', name: 'Model A', needsReview: false },
      { id: 'model-b', name: 'Model B', needsReview: false }
    ])
    expect(agent.model).toBe('model-b')
  })

  it('keeps an unavailable saved model visible as needs-review', () => {
    const agent: AgentSettings = { name: 'reviewer', systemPrompt: '', provider: 'antigravity', accountId: 'account-1', model: 'removed-model' }
    expect(agentModelOptions(agent, snapshot)).toContainEqual({ id: 'removed-model', name: 'removed-model', needsReview: true })
  })

  it('hydrates a stale profile row from the canonical runtime assignment', () => {
    const next = { ...snapshot, assignments: [{ agentId: 'runtime-1', profileName: 'reviewer', providerId: 'antigravity', accountId: 'account-1', modelId: 'model-b', speed: 'fast' as const, revision: 7, status: 'ready' as const }] }
    const agents: AgentSettings[] = [{ name: 'reviewer', systemPrompt: '', provider: 'antigravity', accountId: 'account-1', model: 'model-a', speed: 'standard' }]
    expect(hydrateAgentsFromAssignments(agents, next, { reviewer: 'runtime-1' })[0]).toMatchObject({ model: 'model-b', speed: 'fast' })
  })

  it('hydrates by the active workspace agent ID instead of the highest same-name revision', () => {
    const next = { ...snapshot, assignments: [
      { agentId: 'workspace-a', profileName: 'reviewer', providerId: 'antigravity', accountId: 'account-1', modelId: 'model-a', speed: 'standard' as const, revision: 2, status: 'ready' as const },
      { agentId: 'workspace-b', profileName: 'reviewer', providerId: 'antigravity', accountId: 'account-1', modelId: 'model-b', speed: 'fast' as const, revision: 99, status: 'ready' as const }
    ] }
    const agents: AgentSettings[] = [{ name: 'reviewer', systemPrompt: '' }]

    expect(hydrateAgentsFromAssignments(agents, next, { reviewer: 'workspace-a' })[0]).toMatchObject({ model: 'model-a', speed: 'standard' })
  })

  it('preserves a locally edited account selection until the complete assignment is published', () => {
    const next = { ...snapshot, assignments: [{ agentId: 'workspace-a', profileName: 'reviewer', providerId: 'antigravity', accountId: 'account-1', modelId: 'model-a', speed: 'standard' as const, revision: 2, status: 'ready' as const }] }
    const agents: AgentSettings[] = [{ name: 'reviewer', systemPrompt: '', provider: 'openai', accountId: 'openai-b' }]

    expect(hydrateAgentsFromAssignments(agents, next, { reviewer: 'workspace-a' }, new Set(['reviewer']))[0])
      .toMatchObject({ provider: 'openai', accountId: 'openai-b' })
  })

  it('builds the canonical mutation request for an active workspace agent', () => {
    const agent: AgentSettings = { name: 'reviewer', systemPrompt: '', provider: 'antigravity', accountId: 'account-1', model: 'model-b', speed: 'fast' }
    expect(assignmentRequestForAgent('workspace-a', agent)).toEqual({ agentId: 'workspace-a', providerId: 'antigravity', accountId: 'account-1', modelId: 'model-b', speed: 'fast' })
  })

  it('does not publish a partial assignment before provider account and model are selected', () => {
    expect(assignmentRequestForAgent('workspace-a', { name: 'reviewer', systemPrompt: '', provider: 'openai' })).toBeNull()
    expect(assignmentRequestForAgent('workspace-a', { name: 'reviewer', systemPrompt: '', provider: 'openai', accountId: 'openai-b' })).toBeNull()
    expect(assignmentRequestForAgent('workspace-a', { name: 'reviewer', systemPrompt: '', provider: 'openai', model: 'gpt-code' })).toBeNull()
  })

  it('filters identical-provider models by the explicitly selected account', () => {
    const openAiSnapshot: ProviderSnapshot = {
      revision: 5,
      updatedAt: 5,
      providers: [{ id: 'openai', displayName: 'OpenAI / ChatGPT', description: '', methods: [], capabilities: { modelDiscovery: 'remote', runtime: 'oauth', usage: 'supported' } }],
      accounts: [
        { id: 'openai-a', providerId: 'openai', label: 'first@example.com', authMode: 'oauth', status: 'active', models: [{ id: 'gpt-code-a', name: 'GPT Code A', discoveredAt: 5 }], updatedAt: 5 },
        { id: 'openai-b', providerId: 'openai', label: 'second@example.com', authMode: 'oauth', status: 'active', models: [{ id: 'gpt-code-b', name: 'GPT Code B', discoveredAt: 5 }], updatedAt: 5 }
      ],
      assignments: []
    }

    expect(agentModelOptions({ name: 'reviewer', systemPrompt: '', provider: 'openai', accountId: 'openai-b' }, openAiSnapshot))
      .toEqual([{ id: 'gpt-code-b', name: 'GPT Code B', needsReview: false }])
  })
})
