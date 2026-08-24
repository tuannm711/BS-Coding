import { describe, expect, it } from 'vitest'
import type { JsonStore } from '../../src/main/json-store'
import { SessionStore, type StoredSession } from '../../src/main/agent/session'

function memoryStore(seed: unknown[]): JsonStore<StoredSession> & { values: unknown[] } {
  const values = structuredClone(seed)
  return {
    values,
    load: () => values as StoredSession[],
    save: next => values.splice(0, values.length, ...structuredClone(next))
  }
}

function legacy(id: string, agentId: string, projectPath: string, updatedAt: number) {
  return {
    id,
    agentId,
    projectPath,
    title: id,
    items: [
      { kind: 'message', message: { id: `${id}-u`, role: 'user', text: 'inspect', createdAt: 1 } },
      { kind: 'message', message: { id: `${id}-a`, role: 'assistant', text: 'done', createdAt: 2 } }
    ],
    todos: [{ content: id, status: 'pending' }],
    usage: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0, cost: 0.1 },
    createdAt: 1,
    updatedAt
  }
}

describe('shared session migration', () => {
  it('keeps every legacy session independent and migrates idempotently by project', () => {
    const json = memoryStore([
      legacy('legacy-a', 'agent-a', 'C:/project', 10),
      legacy('legacy-b', 'agent-b', 'C:/project', 20),
      legacy('legacy-c', 'agent-c', 'C:/other', 30)
    ])
    const sessions = new SessionStore(json)

    expect(sessions.listProject('C:/project').map(session => session.id)).toEqual(['legacy-b', 'legacy-a'])
    expect(sessions.get('legacy-a')).toMatchObject({
      schemaVersion: 2,
      projectPath: 'C:/project',
      lastAgentId: 'agent-a',
      legacyAgentId: 'agent-a',
      todos: [{ content: 'legacy-a', status: 'pending' }],
      usage: { input: 2, output: 3, cost: 0.1 }
    })
    expect(sessions.listProject('C:/other').map(session => session.id)).toEqual(['legacy-c'])

    const once = JSON.stringify(json.values)
    new SessionStore(json).listProject('C:/project')
    expect(JSON.stringify(json.values)).toBe(once)
  })

  it('backfills only known legacy execution metadata and never invents provider details', () => {
    const json = memoryStore([
      legacy('legacy-a', 'agent-a', 'C:/project', 10),
      legacy('legacy-b', 'agent-b', 'C:/project', 20)
    ])
    const sessions = new SessionStore(json)

    sessions.backfillLegacyExecution(agentId => agentId === 'agent-a'
      ? {
          agentId,
          agentName: 'Reviewer',
          providerId: 'openai',
          modelId: 'gpt-5.6-sol',
          speed: 'standard'
        }
      : null)

    const known = sessions.transcript('legacy-a').find(item => item.kind === 'message' && item.message.role === 'assistant')
    const unknown = sessions.transcript('legacy-b').find(item => item.kind === 'message' && item.message.role === 'assistant')
    expect(known).toMatchObject({ kind: 'message', message: { execution: {
      agentId: 'agent-a', providerId: 'openai', modelId: 'gpt-5.6-sol', status: 'completed'
    } } })
    expect(unknown?.kind === 'message' ? unknown.message.execution : 'unexpected tool').toBeUndefined()

    const once = JSON.stringify(json.values)
    sessions.backfillLegacyExecution(() => null)
    expect(JSON.stringify(json.values)).toBe(once)
  })
})
