import { describe, expect, it } from 'vitest'
import type { JsonStore } from '../../src/main/json-store'
import { SessionStore, type StoredSession } from '../../src/main/agent/session'
import { SharedSessionCoordinator } from '../../src/main/agent/shared-session-coordinator'
import type { AgentConfig } from '../../src/shared/types'

function memoryStore(): JsonStore<StoredSession> {
  const values: StoredSession[] = []
  return { load: () => values, save: next => values.splice(0, values.length, ...structuredClone(next)) }
}

const agents: AgentConfig[] = [
  { id: 'reviewer-id', name: 'reviewer', templateId: 'bs', cwd: 'C:/project', kind: 'native' },
  { id: 'bs-id', name: 'bs', templateId: 'bs', cwd: 'C:/project', kind: 'native' },
  { id: 'terminal-id', name: 'shell', templateId: 'shell', cwd: 'C:/project', kind: 'pty' }
]

describe('SharedSessionCoordinator', () => {
  it('takes only human steering from the requested session in FIFO order', () => {
    const store = new SessionStore(memoryStore())
    const first = store.createProject('C:/project', 'bs-id')
    const second = store.createProject('C:/project', 'reviewer-id')
    const coordinator = new SharedSessionCoordinator(store)
    coordinator.acquire('C:/project', first.id, 'bs-id')
    coordinator.acquire('C:/project', second.id, 'reviewer-id')
    coordinator.enqueue(first.id, { id: 'a', agentId: 'bs-id', text: 'first', images: [{ id: 'image', name: 'pic', mimeType: 'image/png', dataUrl: 'data:image/png;base64,abc', size: 3 }] })
    coordinator.enqueue(first.id, { id: 'b', agentId: 'bs-id', text: 'delegated', assigned: true })
    coordinator.enqueue(first.id, { id: 'c', agentId: 'bs-id', text: 'last', displayText: '/command' })
    coordinator.enqueue(second.id, { id: 'd', agentId: 'reviewer-id', text: 'other' })
    expect(coordinator.takeSteers(first.id).map(message => message.id)).toEqual(['a', 'c'])
    expect(coordinator.takeSteers(first.id)).toEqual([])
    expect(coordinator.state(first.id)?.queue.map(m => m.id)).toEqual(['b'])
    expect(coordinator.state(second.id)?.queue.map(m => m.id)).toEqual(['d'])
  })
  it('uses deterministic native Agent fallback and persists valid selection', () => {
    const store = new SessionStore(memoryStore())
    const session = store.createProject('C:/project', 'missing')
    const coordinator = new SharedSessionCoordinator(store)

    expect(coordinator.resolveAgent('missing', agents)).toBe('bs-id')
    expect(coordinator.selectAgent('C:/project', session.id, 'reviewer-id', agents)).toMatchObject({
      lastAgentId: 'reviewer-id'
    })
    expect(store.get(session.id)?.lastAgentId).toBe('reviewer-id')
  })

  it('locks one session across running, prompt and queue state then Stop clears it', () => {
    const store = new SessionStore(memoryStore())
    const session = store.createProject('C:/project', 'reviewer-id')
    const coordinator = new SharedSessionCoordinator(store)

    const turn = coordinator.acquire('C:/project', session.id, 'reviewer-id')
    expect(() => coordinator.acquire('C:/project', session.id, 'bs-id')).toThrow(/already running/)
    expect(() => coordinator.selectAgent('C:/project', session.id, 'bs-id', agents)).toThrow(/Agent locked while running/)
    coordinator.setPrompt(turn.turnId, 'prompt-1')
    coordinator.enqueue(session.id, { id: 'q1', agentId: 'reviewer-id', text: 'next' })
    expect(coordinator.state(session.id)).toMatchObject({
      locked: true, agentId: 'reviewer-id', promptId: 'prompt-1', queue: [{ agentId: 'reviewer-id' }]
    })

    coordinator.stop(session.id)
    expect(coordinator.state(session.id)).toBeNull()
    expect(coordinator.selectAgent('C:/project', session.id, 'bs-id', agents)).toMatchObject({ lastAgentId: 'bs-id' })
  })

  it('allows different sessions to run independently', () => {
    const store = new SessionStore(memoryStore())
    const first = store.createProject('C:/project', 'bs-id')
    const second = store.createProject('C:/project', 'reviewer-id')
    const coordinator = new SharedSessionCoordinator(store)

    coordinator.acquire('C:/project', first.id, 'bs-id')
    coordinator.acquire('C:/project', second.id, 'reviewer-id')

    expect(coordinator.state(first.id)?.agentId).toBe('bs-id')
    expect(coordinator.state(second.id)?.agentId).toBe('reviewer-id')
  })
})
