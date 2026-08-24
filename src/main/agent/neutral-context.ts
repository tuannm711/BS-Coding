import type { ModelMessage } from 'ai'
import type { ChatTranscriptItem } from '../../shared/types'
import { truncateToolOutput } from './compact'

export interface NeutralContextOptions {
  toolOutputMaxChars: number
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

    const reply: string[] = []
    let incompleteAgent: string | undefined
    for (const item of group.replies) {
      if (item.kind === 'message') {
        if (item.message.text.trim()) reply.push(item.message.text)
        const status = item.message.execution?.status
        if ((status === 'failed' || status === 'stopped') && !incompleteAgent) {
          incompleteAgent = item.message.execution?.agentName ?? 'Agent'
        }
        continue
      }
      if (item.tool.permission === 'pending' || (item.tool.output === undefined && item.tool.error === undefined)) continue
      const status = item.tool.error || item.tool.permission === 'denied' ? 'failed' : 'completed'
      const output = truncateToolOutput(item.tool.error ?? item.tool.output ?? '', options.toolOutputMaxChars)
      reply.push([
        `[Tool ${item.tool.tool} · ${status}]`,
        `Input: ${safeJson(item.tool.input)}`,
        `${item.tool.error ? 'Error' : 'Output'}: ${output}`
      ].join('\n'))
    }
    if (incompleteAgent) reply.push(`[Incomplete response from ${incompleteAgent}]`)
    if (reply.length > 0) result.push({ role: 'assistant', content: reply.join('\n\n') })
  }
  return result
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable input]'
  }
}
