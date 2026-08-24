import { describe, expect, it } from 'vitest'
import { planNativeAgentReconciliation } from '../../src/main/agent/workspace-reconcile'
import { resolveActiveAgentId } from '../../src/shared/agent-selection'
import { SharedSessionCoordinator } from '../../src/main/agent/shared-session-coordinator'
import { SessionStore, type StoredSession } from '../../src/main/agent/session'

describe('workspace Agent reconciliation', () => {
  const current = [
    { id: 'bs-id', name: 'bs', templateId: 'bs', cwd: 'C:/repo', kind: 'native' as const },
    { id: 'old-id', name: 'old', templateId: 'bs', cwd: 'C:/repo', kind: 'native' as const },
    { id: 'pty-id', name: 'shell', templateId: 'opencode', cwd: 'C:/repo', kind: 'pty' as const }
  ]

  it('adds missing profiles and removes obsolete native agents without touching PTY agents', () => {
    expect(planNativeAgentReconciliation(current, ['bs', 'reviewer'])).toEqual({
      add: ['reviewer'],
      remove: ['old-id']
    })
    expect(current.map(agent => agent.id)).toEqual(['bs-id', 'old-id', 'pty-id'])
  })

  it('always retains bs and rejects duplicate desired names', () => {
    expect(planNativeAgentReconciliation(current, ['reviewer']).remove).not.toContain('bs-id')
    expect(() => planNativeAgentReconciliation(current, ['bs', 'reviewer', 'reviewer'])).toThrow('Duplicate Agent profile name: reviewer')
  })

  it('removes duplicate native runtime Agents while retaining the first matching profile', () => {
    const duplicated = [
      current[0],
      { id: 'reviewer-first', name: 'reviewer', templateId: 'bs', cwd: 'C:/repo', kind: 'native' as const },
      { id: 'reviewer-duplicate', name: 'reviewer', templateId: 'bs', cwd: 'C:/repo', kind: 'native' as const }
    ]
    expect(planNativeAgentReconciliation(duplicated, ['bs', 'reviewer'])).toEqual({
      add: [],
      remove: ['reviewer-duplicate']
    })
  })

  it('falls back to bs when the focused Agent is removed', () => {
    const agents = [{ id: 'bs-id', name: 'bs' }, { id: 'review-id', name: 'reviewer' }]
    expect(resolveActiveAgentId(agents, 'review-id')).toBe('review-id')
    expect(resolveActiveAgentId(agents.slice(0, 1), 'review-id')).toBe('bs-id')
    expect(resolveActiveAgentId([], 'review-id')).toBeNull()
  })

  it('persists the bs fallback into project sessions during reconciliation', () => {
    const sessions: StoredSession[] = []
    const store = new SessionStore({ load: () => sessions, save: next => sessions.splice(0, sessions.length, ...next) })
    const session = store.createProject('C:/repo', 'old-id')
    new SharedSessionCoordinator(store).reconcileAgents([current[0]])
    expect(store.get(session.id)?.lastAgentId).toBe('bs-id')
  })
})
