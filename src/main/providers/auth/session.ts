import { randomUUID } from 'node:crypto'

export interface AuthSession {
  id: string
  providerId: string
  expiresAt: number
}

export class AuthSessionCoordinator {
  private readonly sessions = new Map<string, AuthSession>()

  start(providerId: string, timeoutMs = 300_000): AuthSession {
    const session = { id: randomUUID(), providerId, expiresAt: Date.now() + timeoutMs }
    this.sessions.set(session.id, session)
    return session
  }

  get(id: string): AuthSession | undefined {
    const session = this.sessions.get(id)
    if (!session) return undefined
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(id)
      return undefined
    }
    return session
  }

  cancel(id: string): boolean {
    return this.sessions.delete(id)
  }
}
