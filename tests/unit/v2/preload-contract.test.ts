import { describe, expect, it, vi } from 'vitest'
import {
  createV2Api,
  PUBLIC_V2_API_KEYS,
  resolveV2Enabled
} from '../../../src/preload/v2-api'

const workSession = {
  id: 'session-1', projectId: 'project-1', title: 'Ship V2', goal: 'Ship V2',
  status: 'EXECUTING', createdAt: '2026-08-30T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z'
}
const workflow = {
  id: 'workflow-1', workSessionId: 'session-1', status: 'EXECUTING', blockingGates: 0,
  createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z'
}

describe('secure V2 preload API', () => {
  it('derives one immutable renderer cutover flag from the main bootstrap argument', () => {
    expect(resolveV2Enabled(['electron', '--bs-v2-enabled=1'])).toBe(true)
    expect(resolveV2Enabled(['electron', '--bs-v2-enabled=0'])).toBe(false)
    expect(resolveV2Enabled(['electron'])).toBe(false)
  })

  it('exposes only the approved DTO surface', () => {
    expect(PUBLIC_V2_API_KEYS).toEqual([
      'provider.listAccounts',
      'workflow.get',
      'workflow.subscribe',
      'workSession.create',
      'workSession.pause'
    ])
    expect(PUBLIC_V2_API_KEYS.some(key =>
      /secret|token|filesystem|fshandle|process|ipcrenderer/i.test(key))).toBe(false)
  })

  it('uses registry channels and adds request ids only to commands', async () => {
    const calls: Array<{ channel: string; payload: unknown }> = []
    const api = createV2Api({
      invoke: async (channel, payload) => {
        calls.push({ channel, payload })
        if (channel === 'bs.v2.provider.listAccounts') return []
        if (channel === 'bs.v2.workflow.get') return workflow
        return workSession
      },
      on: () => {}, removeListener: () => {}, nextRequestId: () => 'request-1'
    })

    await api.workSession.create({ projectId: 'project-1', goal: 'Ship V2' })
    await api.workSession.pause('session-1')
    await api.provider.listAccounts()
    await api.workflow.get('workflow-1')

    expect(calls).toEqual([
      { channel: 'bs.v2.workSession.create', payload: { requestId: 'request-1',
        input: { projectId: 'project-1', goal: 'Ship V2' } } },
      { channel: 'bs.v2.workSession.pause', payload: { requestId: 'request-1',
        input: { id: 'session-1' } } },
      { channel: 'bs.v2.provider.listAccounts', payload: {} },
      { channel: 'bs.v2.workflow.get', payload: { id: 'workflow-1' } }
    ])
  })

  it('rejects malformed query responses at the preload boundary', async () => {
    const api = createV2Api({
      invoke: async () => ({ rawSecret: 'must-not-cross' }),
      on: () => {}, removeListener: () => {}, nextRequestId: () => 'request-1'
    })

    await expect(api.workflow.get('workflow-1')).rejects.toThrow()
  })

  it('validates projection events and returns a real unsubscribe function', () => {
    let listener: ((_event: unknown, payload: unknown) => void) | undefined
    const removeListener = vi.fn()
    const callback = vi.fn()
    const api = createV2Api({
      invoke: async () => undefined,
      on: (_channel, registered) => { listener = registered },
      removeListener,
      nextRequestId: () => 'request-1'
    })

    const unsubscribe = api.workflow.subscribe('workflow-1', callback)
    listener?.({}, { sequence: 1, revision: 0, payload: { ...workflow, id: 'workflow-other' } })
    expect(callback).not.toHaveBeenCalled()
    listener?.({}, { sequence: 1, revision: 0, payload: workflow })
    expect(callback).toHaveBeenCalledWith({ sequence: 1, revision: 0,
      payload: workflow })
    expect(() => listener?.({}, { sequence: 0, revision: 0, payload: {} })).toThrow()
    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('bs.v2.workflow.projection', listener)
  })
})
