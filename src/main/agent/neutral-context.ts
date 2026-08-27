import type { ModelMessage } from 'ai'
import type { ChatTranscriptItem } from '../../shared/types'
import { toLlmMessages } from './message'

export interface NeutralContextOptions {
  toolOutputMaxChars: number
}

// Neutral means neutral *ids*, not neutral *shape*. The previous version read
// that requirement as licence to flatten every call into prose, which is what
// taught models that using a tool looks like writing about one.
export function neutraliseItems(items: ChatTranscriptItem[]): ChatTranscriptItem[] {
  const out: ChatTranscriptItem[] = []
  let n = 0
  for (const item of items) {
    if (item.kind === 'message') { out.push(item); continue }
    // A call with no outcome leaves an assistant message holding a call that
    // nothing answers, which providers reject.
    if (item.tool.permission === 'pending') continue
    if (item.tool.output === undefined && item.tool.error === undefined) continue
    // toLlmMessages attaches a call to the assistant message before it. A tool
    // with no assistant ahead of it — legacy transcripts have them — would
    // otherwise emit a result answering a call that was never made, which
    // providers reject.
    const previous = out[out.length - 1]
    if (!previous || previous.kind !== 'message' || previous.message.role !== 'assistant') {
      out.push({ kind: 'message', message: {
        id: `n-anchor-${n}`, role: 'assistant', text: '',
        ...(item.tool.turnId ? { turnId: item.tool.turnId } : {}),
        createdAt: 0
      } })
    }
    n += 1
    const { thoughtSignature: _signature, ...tool } = item.tool
    out.push({ kind: 'tool', tool: { ...tool, id: `n${n}` } })
  }
  return out
}

// The same shape toLlmMessages produces, from a transcript nothing
// provider-specific survived. Two paths, one conversation format — a model is
// never shown its own tool use as prose, so there is no format to imitate.
export function compileNeutralContext(
  items: ChatTranscriptItem[],
  options: NeutralContextOptions
): ModelMessage[] {
  return toLlmMessages(withIncompleteNotes(neutraliseItems(items)), {
    toolOutputMaxChars: options.toolOutputMaxChars
  })
}

// The one thing the record framing carried that is worth keeping: a turn whose
// execution ended failed or stopped is marked, so the next turn does not read a
// truncated answer as a complete one.
function withIncompleteNotes(items: ChatTranscriptItem[]): ChatTranscriptItem[] {
  const lastOfTurn = new Map<string, number>()
  const incomplete = new Map<string, string>()
  items.forEach((item, index) => {
    if (item.kind !== 'message' || item.message.role !== 'assistant') return
    const turnId = item.message.turnId ?? 'legacy'
    lastOfTurn.set(turnId, index)
    const status = item.message.execution?.status
    if (status === 'failed' || status === 'stopped') {
      incomplete.set(turnId, item.message.execution?.agentName ?? 'Agent')
    }
  })
  return items.map((item, index) => {
    if (item.kind !== 'message' || item.message.role !== 'assistant') return item
    const turnId = item.message.turnId ?? 'legacy'
    const agentName = incomplete.get(turnId)
    if (!agentName || lastOfTurn.get(turnId) !== index) return item
    const note = `[Incomplete response from ${agentName}]`
    const text = item.message.text.trim() ? `${item.message.text}

${note}` : note
    return { kind: 'message', message: { ...item.message, text } }
  })
}
