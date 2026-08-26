import { looksLikeNarratedToolCall } from '@shared/narrated-tool-call'
import type { FeedItem } from './FeedRow'

const NOTICE = 'The model wrote out a tool call instead of making one. Nothing ran.'

// Detection at append time cannot see a session that already contains
// narration: listSessionTranscript returns stored items without re-reading
// their text, which is how the original case went unnoticed.
export function withNarrationNotices(items: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = []
  for (const item of items) {
    out.push(item)
    if (item.kind === 'message' && item.role === 'assistant' && looksLikeNarratedToolCall(item.text)) {
      // Derived from the message id so it is stable across reloads and distinct
      // per message; a timestamp would collide within one pass.
      out.push({ kind: 'notice', id: `n-${item.id}`, text: NOTICE })
    }
  }
  return out
}
