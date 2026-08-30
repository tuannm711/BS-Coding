import { describe, expect, it, vi } from 'vitest'
import {
  runIdempotentCommand, runIdempotentExternalCommand
} from '../../../src/main/v2/application/commands/idempotent-command'
import type { CommandIdempotencyPort } from '../../../src/main/v2/application/ports/command-idempotency-port'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRepositories } from '../../../src/main/v2/infrastructure/persistence/repositories'

function memoryPort(): CommandIdempotencyPort {
  const values = new Map<string, { status: 'IN_PROGRESS' | 'COMPLETED'; result?: unknown }>()
  const key = (requestId: string, commandName: string) => `${requestId}:${commandName}`
  return {
    async reserve(requestId, commandName) {
      const existing = values.get(key(requestId, commandName))
      if (existing?.status === 'COMPLETED') return { status: 'COMPLETED', result: existing.result }
      if (existing) return { status: 'IN_PROGRESS' }
      values.set(key(requestId, commandName), { status: 'IN_PROGRESS' })
      return { status: 'RESERVED' }
    },
    async complete(requestId, commandName, result) {
      values.set(key(requestId, commandName), { status: 'COMPLETED', result })
    },
    async release(requestId, commandName) { values.delete(key(requestId, commandName)) }
  }
}

describe('durable command idempotency orchestration', () => {
  it('replays a completed request without repeating the transition', async () => {
    const operation = vi.fn(async () => ({ status: 'PAUSED' }))
    const deps = { idempotency: memoryPort(), transaction: async <T>(fn: () => Promise<T>) => fn() }

    const first = await runIdempotentCommand(deps, 'req-1', 'workSession.pause', operation)
    const replay = await runIdempotentCommand(deps, 'req-1', 'workSession.pause', operation)

    expect(replay).toEqual(first)
    expect(operation).toHaveBeenCalledOnce()
  })

  it('rejects an in-progress duplicate and releases a failed reservation for retry', async () => {
    const port = memoryPort()
    await port.reserve('busy', 'command')
    const deps = { idempotency: port, transaction: async <T>(fn: () => Promise<T>) => fn() }
    await expect(runIdempotentCommand(deps, 'busy', 'command', async () => 'no'))
      .rejects.toMatchObject({ code: 'COMMAND_IN_PROGRESS' })

    const failing = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce('ok')
    await expect(runIdempotentCommand(deps, 'retry', 'command', failing)).rejects.toThrow('failed')
    await expect(runIdempotentCommand(deps, 'retry', 'command', failing)).resolves.toBe('ok')
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it('replays a completed result after reopening the SQLite database', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-idempotency-'))
    const file = path.join(dir, 'v2.sqlite')
    const transaction = async <T>(fn: () => Promise<T>) => fn()
    let db: ReturnType<typeof openV2Database> | undefined
    try {
      db = openV2Database(file)
      migrate(db)
      let repositories = createRepositories(db)
      const firstOperation = vi.fn(async () => ({ status: 'PAUSED' }))
      await runIdempotentCommand({ idempotency: repositories.commandIdempotency, transaction },
        'req-persisted', 'workSession.pause', firstOperation)
      db.close()
      db = undefined

      db = openV2Database(file)
      migrate(db)
      repositories = createRepositories(db)
      const replayOperation = vi.fn(async () => ({ status: 'WRONG' }))
      await expect(runIdempotentCommand({ idempotency: repositories.commandIdempotency, transaction },
        'req-persisted', 'workSession.pause', replayOperation))
        .resolves.toEqual({ status: 'PAUSED' })
      expect(replayOperation).not.toHaveBeenCalled()
      db.close()
      db = undefined
    } finally {
      db?.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('commits an external reservation before the side effect and result afterward', async () => {
    const order: string[] = []
    const deps = { idempotency: memoryPort(), transaction: async <T>(fn: () => Promise<T>) => {
      order.push('transaction:start'); const result = await fn(); order.push('transaction:commit'); return result
    } }
    const result = await runIdempotentExternalCommand(deps, 'request-external', 'provider.connect',
      async () => { order.push('external:side-effect'); return { ok: true } })
    expect(result).toEqual({ ok: true })
    expect(order).toEqual(['transaction:start', 'transaction:commit', 'external:side-effect',
      'transaction:start', 'transaction:commit'])
  })

  it('does not automatically repeat an external side effect after an ambiguous failure', async () => {
    const operation = vi.fn(async () => { throw new Error('provider failed after write') })
    const deps = { idempotency: memoryPort(), transaction: async <T>(fn: () => Promise<T>) => fn() }
    await expect(runIdempotentExternalCommand(deps, 'request-ambiguous', 'provider.connect', operation))
      .rejects.toThrow('provider failed after write')
    await expect(runIdempotentExternalCommand(deps, 'request-ambiguous', 'provider.connect', operation))
      .rejects.toMatchObject({ code: 'COMMAND_IN_PROGRESS' })
    expect(operation).toHaveBeenCalledOnce()
  })
})
