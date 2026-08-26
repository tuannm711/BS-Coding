import { describe, expect, it } from 'vitest'
import { withNarrationNotices } from '../../src/renderer/src/components/chat/transcript-notices'
import type { FeedItem } from '../../src/renderer/src/components/chat/FeedRow'

const narrated = '[Tool bash \u00b7 completed]\nInput: {"command":"ls"}\nOutput: a'

describe('withNarrationNotices', () => {
  it('follows a narrated assistant message with a notice', () => {
    const items: FeedItem[] = [{ kind: 'message', id: 'a1', role: 'assistant', text: narrated }]
    const out = withNarrationNotices(items)
    expect(out).toHaveLength(2)
    expect(out[1].kind).toBe('notice')
  })

  it('leaves ordinary messages alone', () => {
    const items: FeedItem[] = [
      { kind: 'message', id: 'u1', role: 'user', text: narrated },
      { kind: 'message', id: 'a2', role: 'assistant', text: 'I will use the bash tool.' }
    ]
    expect(withNarrationNotices(items)).toHaveLength(2)
  })

  it('gives each notice a distinct id', () => {
    const items: FeedItem[] = [
      { kind: 'message', id: 'a1', role: 'assistant', text: narrated },
      { kind: 'message', id: 'a2', role: 'assistant', text: narrated }
    ]
    const ids = withNarrationNotices(items).filter(i => i.kind === 'notice').map(i => i.id)
    expect(new Set(ids).size).toBe(2)
  })
})
