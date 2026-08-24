import { randomUUID } from 'node:crypto'
import type { AgentConfig, ProjectSessionSummary, SessionQueuedMessage } from '../../shared/types'
import type { SessionStore } from './session'

export interface SessionExecutionState {
  projectPath: string
  sessionId: string
  agentId: string
  turnId: string
  locked: boolean
  promptId?: string
  queue: SessionQueuedMessage[]
}

export class SharedSessionCoordinator {
  private readonly executions = new Map<string, SessionExecutionState>()

  constructor(private readonly store: SessionStore) {}

  resolveAgent(preferred: string | undefined, agents: AgentConfig[]): string | null {
    const native = agents.filter(agent => agent.kind !== 'pty')
    if (preferred && native.some(agent => agent.id === preferred)) return preferred
    return native.find(agent => agent.name === 'bs')?.id ?? native[0]?.id ?? null
  }

  selectAgent(projectPath: string, sessionId: string, agentId: string, agents: AgentConfig[]): ProjectSessionSummary {
    if (this.executions.has(sessionId)) throw new Error('[bs] Agent locked while running')
    if (!agents.some(agent => agent.id === agentId && agent.kind !== 'pty')) {
      throw new Error(`[bs] Agent ${agentId} is not available`)
    }
    const session = this.projectSession(projectPath, sessionId)
    this.store.setLastAgent(session.id, agentId)
    return this.projectSession(projectPath, sessionId)
  }

  acquire(projectPath: string, sessionId: string, agentId: string): SessionExecutionState {
    this.projectSession(projectPath, sessionId)
    if (this.executions.has(sessionId)) throw new Error(`[bs] Session ${sessionId} is already running`)
    const state: SessionExecutionState = {
      projectPath,
      sessionId,
      agentId,
      turnId: randomUUID(),
      locked: true,
      queue: []
    }
    this.executions.set(sessionId, state)
    return this.clone(state)
  }

  enqueue(sessionId: string, message: SessionQueuedMessage): void {
    const state = this.requireState(sessionId)
    state.queue.push(structuredClone(message))
  }

  dequeue(sessionId: string): SessionQueuedMessage | undefined {
    return this.executions.get(sessionId)?.queue.shift()
  }

  setPrompt(turnId: string, promptId?: string): void {
    const state = [...this.executions.values()].find(item => item.turnId === turnId)
    if (!state) throw new Error(`[bs] Turn ${turnId} is not running`)
    state.promptId = promptId
  }

  complete(sessionId: string): void {
    const state = this.executions.get(sessionId)
    if (!state) return
    state.promptId = undefined
    if (state.queue.length === 0) this.executions.delete(sessionId)
  }

  fail(sessionId: string): void {
    this.executions.delete(sessionId)
  }

  stop(sessionId: string): void {
    this.executions.delete(sessionId)
  }

  state(sessionId: string): SessionExecutionState | null {
    const state = this.executions.get(sessionId)
    return state ? this.clone(state) : null
  }

  reconcileAgents(agents: AgentConfig[]): void {
    for (const session of this.store.listAll()) {
      const next = this.resolveAgent(session.lastAgentId, agents)
      if (next && next !== session.lastAgentId) this.store.setLastAgent(session.id, next)
    }
  }

  private projectSession(projectPath: string, sessionId: string): ProjectSessionSummary {
    const session = this.store.listProject(projectPath).find(item => item.id === sessionId)
    if (!session) throw new Error(`[bs] Session ${sessionId} does not belong to ${projectPath}`)
    return session
  }

  private requireState(sessionId: string): SessionExecutionState {
    const state = this.executions.get(sessionId)
    if (!state) throw new Error(`[bs] Session ${sessionId} is not running`)
    return state
  }

  private clone(state: SessionExecutionState): SessionExecutionState {
    return { ...state, queue: structuredClone(state.queue) }
  }
}
