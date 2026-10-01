import type { ToolCallData } from '@shared/types'
import type { FeedItem } from './FeedRow'

/** Merge an initial disk snapshot with events received during its IPC round trip. */
export function mergeTranscriptSnapshot(snapshot: FeedItem[], live: FeedItem[]): FeedItem[] {
  const result = [...snapshot]
  let cursor = 0
  for (const [liveIndex, item] of live.entries()) {
    let index = result.findIndex(candidate => candidate.kind === item.kind &&
      (item.kind === 'subagent' ? candidate.kind === 'subagent' && candidate.taskId === item.taskId
        : candidate.kind !== 'subagent' && candidate.id === item.id))
    if (index < 0 && item.kind === 'message' && item.role === 'assistant' && (item.text || item.reasoning)) {
      const turnId = item.turnId ?? item.execution?.turnId
      const nextTool = live.slice(liveIndex + 1).find(candidate => candidate.kind === 'tool' && (candidate.call.turnId ?? candidate.call.execution?.turnId) === turnId)
      const anchor = nextTool?.kind === 'tool' ? result.findIndex(candidate => candidate.kind === 'tool' && candidate.id === nextTool.id) : -1
      let boundary = -1
      for (let position = 0; position < (anchor >= 0 ? anchor : result.length); position++) {
        const candidate = result[position]
        if (candidate.kind === 'tool' && (candidate.call.turnId ?? candidate.call.execution?.turnId) === turnId) boundary = position
      }
      index = result.findIndex((candidate, position) => position >= Math.max(cursor, boundary + 1) && (anchor < 0 || position < anchor) && candidate.kind === 'message' && candidate.role === 'assistant'
        && turnId && (candidate.turnId ?? candidate.execution?.turnId) === turnId
        && (!item.text || !!candidate.text && (candidate.text.endsWith(item.text) || item.text.endsWith(candidate.text)))
        && (!item.reasoning || !!candidate.reasoning && (candidate.reasoning.endsWith(item.reasoning) || item.reasoning.endsWith(candidate.reasoning))))
    }
    if (index < 0) { result.push(item); cursor = result.length; continue }
    const stored = result[index]
    if (stored.kind === 'message' && item.kind === 'message' && stored.role === 'assistant') {
      result[index] = { ...stored, id: item.id, text: stored.text.length >= item.text.length ? stored.text : item.text,
        reasoning: (stored.reasoning?.length ?? 0) >= (item.reasoning?.length ?? 0) ? stored.reasoning : item.reasoning,
        execution: item.execution ?? stored.execution }
    } else if (stored.kind === 'tool' && item.kind === 'tool' && item.call.output === undefined && item.call.error === undefined && stored.call.output !== undefined) {
      result[index] = stored
    } else result[index] = item
    cursor = index + 1
  }
  return result
}

/** Final means the last substantive item in a successfully finished turn. */
export function finalResponseIds(items: FeedItem[]): Set<string> {
  const last = new Map<string, FeedItem>()
  for (const item of items) {
    if (item.kind === 'message') {
      const turnId = item.turnId ?? item.execution?.turnId
      if (item.role === 'assistant' && turnId && item.text.trim()) last.set(turnId, item)
    } else if (item.kind === 'tool') {
      const turnId = item.call.turnId ?? item.call.execution?.turnId
      if (turnId) last.set(turnId, item)
    }
  }
  return new Set([...last.values()].flatMap(item => item.kind === 'message' && item.execution?.status === 'completed' ? [item.id] : []))
}

export function toolActivityStatus(call: ToolCallData): 'Running' | 'Completed' | 'Failed' | 'Denied' {
  if (call.permission === 'denied') return 'Denied'
  if (call.error !== undefined) return 'Failed'
  if (call.output !== undefined) return 'Completed'
  return 'Running'
}

export function workedDuration(startedAt: number, completedAt: number): string {
  const seconds = Math.max(0, Math.round((completedAt - startedAt) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
