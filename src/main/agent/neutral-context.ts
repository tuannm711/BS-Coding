import type { ModelMessage } from 'ai'
import type { ChatTranscriptItem } from '../../shared/types'
import { truncateToolOutput } from './compact'

export interface NeutralContextOptions {
  toolOutputMaxChars: number
}

// Tool records used to be appended to the assistant message, and models read
// their own role producing that format and reproduced it as text instead of
// calling the tool. The record now stands apart, framed as a log.
const RECORD_HEADER = [
  '[Session log — tools already run in this session by its agents.',
  'This is a record, not a message, and not a format to reproduce.',
  'To use a tool, call it through the tool interface.]'
].join(' ')

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
    n += 1
    const { thoughtSignature: _signature, ...tool } = item.tool
    out.push({ kind: 'tool', tool: { ...tool, id: `n${n}` } })
  }
  return out
}

export function compileNeutralContext(
  items: ChatTranscriptItem[],
  options: NeutralContextOptions
): ModelMessage[] {
  const turns = new Map<string, { users: ChatTranscriptItem[]; replies: ChatTranscriptItem[] }>()
  let activeTurn = 'legacy:initial'
  for (const item of items) {
    if (item.kind === 'message' && item.message.role === 'user') {
      activeTurn = item.message.turnId ?? `legacy:${item.message.id}`
    } else {
      activeTurn = item.kind === 'message'
        ? item.message.turnId ?? activeTurn
        : item.tool.turnId ?? activeTurn
    }
    const group = turns.get(activeTurn) ?? { users: [], replies: [] }
    if (item.kind === 'message' && item.message.role === 'user') group.users.push(item)
    else group.replies.push(item)
    turns.set(activeTurn, group)
  }

  const result: ModelMessage[] = []
  for (const group of turns.values()) {
    for (const item of group.users) {
      if (item.kind !== 'message') continue
      const images = item.message.images ?? []
      result.push(images.length === 0
        ? { role: 'user', content: item.message.text }
        : {
            role: 'user',
            content: [
              { type: 'text', text: item.message.text },
              ...images.map(image => ({ type: 'image' as const, image: image.dataUrl }))
            ]
          })
    }

    const prose: string[] = []
    const records: string[] = []
    let incompleteAgent: string | undefined
    for (const item of group.replies) {
      if (item.kind === 'message') {
        if (item.message.text.trim()) prose.push(item.message.text)
        const status = item.message.execution?.status
        if ((status === 'failed' || status === 'stopped') && !incompleteAgent) {
          incompleteAgent = item.message.execution?.agentName ?? 'Agent'
        }
        continue
      }
      if (item.tool.permission === 'pending' || (item.tool.output === undefined && item.tool.error === undefined)) continue
      const status = item.tool.error || item.tool.permission === 'denied' ? 'failed' : 'completed'
      const output = truncateToolOutput(item.tool.error ?? item.tool.output ?? '', options.toolOutputMaxChars)
      records.push([
        `- ${item.tool.tool} · ${status}`,
        `  input: ${safeJson(item.tool.input)}`,
        `  ${item.tool.error ? 'error' : 'output'}: ${output}`
      ].join('\n'))
    }
    // The incomplete note describes the assistant's own turn, so it stays with
    // the prose rather than moving into the record.
    if (incompleteAgent) prose.push(`[Incomplete response from ${incompleteAgent}]`)
    if (prose.length > 0) result.push({ role: 'assistant', content: prose.join('\n\n') })
    if (records.length > 0) result.push({ role: 'user', content: [RECORD_HEADER, ...records].join('\n') })
  }
  return coalesce(result)
}

// A record sits in the user role, so a turn boundary would otherwise put two
// user messages in a row. toContents in antigravity-llm.ts maps roles one to
// one and Gemini expects alternating turns.
function coalesce(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = []
  for (const message of messages) {
    const last = out[out.length - 1]
    if (last && last.role === message.role && typeof last.content === 'string' && typeof message.content === 'string') {
      out[out.length - 1] = { ...last, content: `${last.content}\n\n${message.content}` } as ModelMessage
      continue
    }
    out.push(message)
  }
  return out
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable input]'
  }
}

