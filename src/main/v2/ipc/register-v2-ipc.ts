import type { z } from 'zod'
import { V2_IPC } from '../../../shared/v2/contracts/ipc'
import { validatedHandler } from './validated-handler'

export interface V2IpcRegistrar {
  handle(channel: string, handler: (event: unknown, raw: unknown) => unknown): void
  removeHandler(channel: string): void
}

export interface V2IpcRoute {
  channel: string
  input: z.ZodType<unknown>
  output: z.ZodType<unknown>
  service(input: never): Promise<unknown>
}

const registeredChannels = new Set<string>(
  Object.values(V2_IPC).flatMap(family => Object.values(family))
)

export function registerV2Ipc(input: {
  registrar: V2IpcRegistrar
  routes: readonly V2IpcRoute[]
}): () => void {
  const seen = new Set<string>()
  for (const route of input.routes) {
    if (!registeredChannels.has(route.channel)) throw new Error(`unknown V2 IPC channel ${route.channel}`)
    if (seen.has(route.channel)) throw new Error(`duplicate V2 IPC channel ${route.channel}`)
    seen.add(route.channel)
  }
  for (const route of input.routes) {
    input.registrar.handle(route.channel, validatedHandler({
      input: route.input,
      output: route.output,
      service: value => route.service(value as never)
    }))
  }
  return () => {
    for (const channel of seen) input.registrar.removeHandler(channel)
  }
}
