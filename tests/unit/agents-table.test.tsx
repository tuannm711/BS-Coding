import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AgentSettings } from '../../src/shared/types'
import AgentsTab, {
  reconcileAgentAccountSelection,
  reconcileAgentProviderSelection
} from '../../src/renderer/src/components/settings/AgentsTab'
import AgentPromptModal from '../../src/renderer/src/components/settings/AgentPromptModal'

const agents: AgentSettings[] = [
  {
    name: 'bs',
    systemPrompt: 'default prompt must stay out of the table',
    provider: 'openai',
    accountId: 'account-a',
    model: 'gpt-5.6-codex',
    speed: 'standard'
  },
  {
    name: 'reviewer',
    systemPrompt: 'review prompt must stay out of the table',
    provider: 'antigravity',
    accountId: 'account-b',
    model: 'claude-sonnet-4.6',
    speed: 'fast'
  }
]

describe('Agents settings table', () => {
  it('renders one semantic row per Agent with compact operational columns', () => {
    const html = renderToStaticMarkup(
      <AgentsTab
        agents={agents}
        runtimeAgents={[]}
        onChangeAgents={vi.fn()}
        onChangeSubagentModels={vi.fn()}
      />
    )

    expect(html).toContain('<table')
    expect(html).toContain('<th scope="col">Name</th>')
    expect(html).toContain('<th scope="col">Provider</th>')
    expect(html).toContain('<th scope="col">Account</th>')
    expect(html).toContain('<th scope="col">Model</th>')
    expect(html).toContain('<th scope="col">Mode</th>')
    expect((html.match(/class="agent-table-row"/g) ?? [])).toHaveLength(2)
    expect(html).not.toContain('default prompt must stay out of the table')
    expect(html).not.toContain('review prompt must stay out of the table')
  })

  it('exposes labelled icon actions and protects the default Agent', () => {
    const html = renderToStaticMarkup(
      <AgentsTab
        agents={agents}
        runtimeAgents={[]}
        onChangeAgents={vi.fn()}
        onChangeSubagentModels={vi.fn()}
      />
    )

    expect(html).toContain('aria-label="Edit system prompt for bs"')
    expect(html).toContain('aria-label="Delete bs"')
    expect(html).toContain('aria-label="Edit system prompt for reviewer"')
    expect(html).toContain('aria-label="Delete reviewer"')
    expect(html).toMatch(/aria-label="Delete bs"[^>]*disabled=""/)
  })

  it('renders the system prompt only inside the dedicated edit modal', () => {
    const html = renderToStaticMarkup(
      <AgentPromptModal agent={agents[1]} onClose={vi.fn()} onSave={vi.fn()} />
    )

    expect(html).toContain('Edit reviewer system prompt')
    expect(html).toContain('review prompt must stay out of the table')
    expect(html).toContain('Save prompt')
  })

  it('clears account and model when the provider changes', () => {
    expect(reconcileAgentProviderSelection(agents[1], 'openai')).toMatchObject({
      provider: 'openai',
      accountId: undefined,
      model: undefined
    })
  })

  it('keeps a model only when the selected account offers it', () => {
    expect(reconcileAgentAccountSelection(agents[0], 'account-b', ['gpt-5.6-codex']))
      .toMatchObject({ accountId: 'account-b', model: 'gpt-5.6-codex' })
    expect(reconcileAgentAccountSelection(agents[0], 'account-b', ['gpt-5.5-codex']))
      .toMatchObject({ accountId: 'account-b', model: undefined })
  })
})
