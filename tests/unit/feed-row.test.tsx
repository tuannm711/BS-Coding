import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeedRow, type FeedItem } from '../../src/renderer/src/components/chat/FeedRow'

const render = (item: FeedItem) => renderToStaticMarkup(
  React.createElement(FeedRow, {
    item, commands: [], onOpenImage: () => {}, onOpenFile: () => {}, onOpenSubagent: () => {}
  })
)

describe('FeedRow', () => {
  it('renders a notice', () => {
    const markup = render({ kind: 'notice', id: 'n1', text: 'Nothing ran.' })
    expect(markup).toContain('chat-notice')
    expect(markup).toContain('Nothing ran.')
  })

  it('distinguishes a failed compaction from a successful one', () => {
    expect(render({ kind: 'compaction', id: 'c1' })).toContain('Context compacted')
    const failed = render({ kind: 'compaction', id: 'c2', failed: true })
    expect(failed).toContain('Context compaction failed')
    expect(failed).toContain('failed')
  })

  it('renders an error', () => {
    expect(render({ kind: 'error', id: 'e1', text: 'boom' })).toContain('chat-error')
  })

  it('renders a subagent with its tools and state', () => {
    const markup = render({
      kind: 'subagent', taskId: 't1', text: 'working', tools: ['read', 'bash'], state: 'running'
    })
    expect(markup).toContain('sub-agent')
    expect(markup).toContain('read')
    expect(markup).toContain('state-running')
  })

  it('renders nothing for an assistant message that is still empty', () => {
    expect(render({ kind: 'message', id: 'm1', role: 'assistant', text: '   ' })).toBe('')
    expect(render({ kind: 'message', id: 'm2', role: 'user', text: 'hello' })).toContain('hello')
  })
})
