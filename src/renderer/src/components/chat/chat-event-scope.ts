import type { ChatEvent } from '@shared/types'

export interface ActiveChatScope {
  projectPath: string
  sessionId: string
  turnId?: string
}

export function acceptChatEvent(active: ActiveChatScope, event: ChatEvent): boolean {
  if (event.projectPath !== active.projectPath || event.sessionId !== active.sessionId) return false
  return !active.turnId || !event.turnId || event.turnId === active.turnId
}
