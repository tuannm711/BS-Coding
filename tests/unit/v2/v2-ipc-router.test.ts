import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createV2Runtime } from '../../../src/main/v2/application/v2-bootstrap'
import { defineV2IpcRoute, registerV2Ipc } from '../../../src/main/v2/ipc/register-v2-ipc'
import { validatedHandler } from '../../../src/main/v2/ipc/validated-handler'

describe('V2 IPC router', () => {
  it('rejects invalid input before service call and validates output', async () => {
    const service = vi.fn(async (input: { id: string }) => ({ id: input.id, status: 'ok' }))
    const handler = validatedHandler({
      input: z.object({ id: z.string().min(1) }).strict(),
      output: z.object({ id: z.string(), status: z.literal('ok') }).strict(),
      service
    })

    await expect(handler({}, { id: 1 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(service).not.toHaveBeenCalled()
    await expect(handler({}, { id: 'ws1' })).resolves.toEqual({ id: 'ws1', status: 'ok' })
  })

  it('normalizes service and response contract failures without leaking stack data', async () => {
    const serviceFailure = validatedHandler({
      input: z.object({ id: z.string() }), output: z.object({ ok: z.boolean() }),
      service: async () => { throw new Error('database offline apiKey=secret') }
    })
    const responseFailure = validatedHandler({
      input: z.object({ id: z.string() }), output: z.object({ ok: z.boolean() }),
      service: async () => ({ wrong: true })
    })

    await expect(serviceFailure({}, { id: 'ws1' })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR', message: 'V2 IPC service failed'
    })
    await expect(responseFailure({}, { id: 'ws1' })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE'
    })
  })

  it('registers unique namespaced routes and removes them on runtime dispose', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const registrar = {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        if (handlers.has(channel)) throw new Error(`duplicate ${channel}`)
        handlers.set(channel, handler)
      },
      removeHandler: (channel: string) => { handlers.delete(channel) }
    }
    const route = defineV2IpcRoute({
      channel: 'bs.v2.project.get', input: z.object({ id: z.string() }),
      output: z.object({ id: z.string() }), service: async (input: { id: string }) => input
    })

    expect(() => registerV2Ipc({ registrar, routes: [route, route] })).toThrow(/duplicate/i)
    const runtime = await createV2Runtime({
      enabled: true,
      start: async () => ({ dispose: registerV2Ipc({ registrar, routes: [route] }) })
    })
    expect(handlers.has('bs.v2.project.get')).toBe(true)
    await runtime.dispose()
    expect(handlers.size).toBe(0)
  })
})
