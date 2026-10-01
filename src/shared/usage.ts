import type { MessageTokens, ChatTranscriptItem } from './types'

// Mỗi provider quy ước totalTokens một kiểu (Anthropic tách cache read khỏi
// input_tokens, OpenAI gộp sẵn), nên ta tin totalTokens khi có và chỉ tự cộng
// khi provider không trả. Breakdown được lưu trong MessageTokens để sau này
// chỉnh công thức ở đúng một chỗ.
export function contextTokens(u: MessageTokens): number {
  return u.total > 0 ? u.total : u.input + u.output + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0)
}

// Context reflects the last response, including input-only/tool responses.
// Missing usage on a newer response must not revive an older measurement.
export function latestContextTokens(items: ChatTranscriptItem[]): number | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind === 'message' && item.message.role === 'user') return null
    if (item.kind === 'message' && item.message.role === 'assistant') {
      return item.message.tokens ? contextTokens(item.message.tokens) : null
    }
  }
  return null
}

export function contextPercent(tokens: number, limit: number | null): number | null {
  if (!limit || limit <= 0) return null
  return Math.round((tokens / limit) * 100)
}

export type ContextLevel = 'normal' | 'warn' | 'danger'

export function contextLevel(tokens: number, compactThreshold: number | null): ContextLevel {
  if (!compactThreshold || compactThreshold <= 0) return 'normal'
  if (tokens >= compactThreshold) return 'danger'
  if (tokens >= compactThreshold * 0.8) return 'warn'
  return 'normal'
}
