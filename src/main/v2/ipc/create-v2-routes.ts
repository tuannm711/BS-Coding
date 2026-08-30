import { P15_IPC } from '../../../shared/v2/contracts/p15-backend-ipc'
import { P15PublicIpcSchemas } from '../../../shared/v2/schemas/p15-backend-ipc'
import { defineV2IpcRoute, type V2IpcRoute } from './register-v2-ipc'
import type { z } from 'zod'

export interface V2RouteServices {
  handlers: Readonly<Record<string, (input: unknown) => Promise<unknown>>>
}

export function createV2Routes(services: V2RouteServices): V2IpcRoute[] {
  return Object.entries(P15PublicIpcSchemas).flatMap(([key, contract]) => {
    if (!('request' in contract) || !('response' in contract)) return []
    const invokeContract = contract as { request: z.ZodType<unknown>; response: z.ZodType<unknown> }
    const service = services.handlers[key]
    if (!service) throw new Error(`missing V2 service handler ${key}`)
    return [defineV2IpcRoute({ channel: P15_IPC[key as keyof typeof P15_IPC],
      input: invokeContract.request, output: invokeContract.response, service })]
  })
}
