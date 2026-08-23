import { describe, expect, it } from 'vitest'
import { AuthSessionCoordinator } from '../../src/main/providers/auth/session'

describe('provider auth sessions', () => {
  it('isolates concurrent sessions and supports cancellation', () => {
    const sessions = new AuthSessionCoordinator()
    const first = sessions.start('cursor', 50)
    const second = sessions.start('cursor', 50)
    expect(first.id).not.toBe(second.id)
    expect(sessions.get(first.id)?.providerId).toBe('cursor')
    expect(sessions.cancel(first.id)).toBe(true)
    expect(sessions.get(first.id)).toBeUndefined()
    expect(sessions.get(second.id)).toBeDefined()
    sessions.cancel(second.id)
  })
})
