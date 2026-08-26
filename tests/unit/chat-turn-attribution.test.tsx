import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TurnAttributionBadge } from '../../src/renderer/src/components/chat/FeedRow'
import ContextFooter from '../../src/renderer/src/components/chat/ContextFooter'

describe('immutable chat turn attribution', () => {
  it('renders stored Agent/model and provider/account labels without current config', () => {
    const html = renderToStaticMarkup(<TurnAttributionBadge execution={{
      turnId: 'turn-1', agentId: 'deleted-agent', agentName: 'Reviewer',
      providerId: 'openai', accountId: 'account-1', accountLabel: 'pro@example.com',
      modelId: 'gpt-5.6-sol', modelLabel: 'GPT-5.6 SOL', speed: 'standard',
      startedAt: 1, completedAt: 2, status: 'completed'
    }} />)
    expect(html).toContain('Reviewer · GPT-5.6 SOL')
    expect(html).toContain('openai · pro@example.com')
  })

  it('shows persisted aggregate session tokens independently of context availability', () => {
    const html = renderToStaticMarkup(<ContextFooter
      tokens={null} limit={null} compactThreshold={null} cost={0.12}
      sessionTokens={{ input: 1000, output: 250 }}
    />)
    expect(html).toContain('data-testid="context-session-tokens"')
    expect(html).toContain('1,250')
  })
})
