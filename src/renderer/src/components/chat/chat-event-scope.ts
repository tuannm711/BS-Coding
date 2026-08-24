import type { ChatEvent } from '@shared/types'

export interface ActiveChatScope {
  projectPath: string
  sessionId: string
  turnId?: string
}

export function acceptChatEvent(active: ActiveChatScope, event: ChatEvent): boolean {
  const scoped = event as ChatEvent & Partial<ActiveChatScope>
  if (scoped.projectPath !== active.projectPath || scoped.sessionId !== active.sessionId) return false
  return !active.turnId || !scoped.turnId || scoped.turnId === active.turnId
}
