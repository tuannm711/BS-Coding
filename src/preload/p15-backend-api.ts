import type { z } from 'zod'
import { P15_IPC, type P15PublicApiKey } from '../shared/v2/contracts/p15-backend-ipc'
import { P15PublicIpcSchemas } from '../shared/v2/schemas/p15-backend-ipc'

type Contracts = typeof P15PublicIpcSchemas
type InvokeKey = Exclude<P15PublicApiKey, 'workflow.projection'>
type RequestSchema<K extends InvokeKey> = Contracts[K] extends { request: infer S extends z.ZodTypeAny } ? S : never
type ResponseSchema<K extends InvokeKey> = Contracts[K] extends { response: infer S extends z.ZodTypeAny } ? S : never
type WireRequest<K extends InvokeKey> = z.input<RequestSchema<K>>
type PublicRequest<K extends InvokeKey> = WireRequest<K> extends { requestId: string; input: infer I } ? I : WireRequest<K>
type PublicResponse<K extends InvokeKey> = z.output<ResponseSchema<K>>

export type P15BackendApi = {
  readonly [K in InvokeKey]: (request: PublicRequest<K>) => Promise<PublicResponse<K>>
}

const commandKeys = new Set<InvokeKey>([
  'workSession.create','workSession.pause','workSession.resume','workSession.cancel',
  'workSession.switchRuntime','workflow.approvePlan','workflow.createRework','agent.create',
  'agent.update','agent.remove','provider.connect','provider.refresh','provider.setEnabled',
  'provider.probe','settings.update'
])

export function createP15BackendApi(deps: {
  invoke(channel: string, payload: unknown): Promise<unknown>
  nextRequestId(): string
}): P15BackendApi {
  const api: Partial<Record<InvokeKey, (request: unknown) => Promise<unknown>>> = {}
  for (const key of Object.keys(P15PublicIpcSchemas) as P15PublicApiKey[]) {
    if (key === 'workflow.projection') continue
    const contract = P15PublicIpcSchemas[key] as { request: z.ZodTypeAny; response: z.ZodTypeAny }
    api[key] = async request => {
      const wire = commandKeys.has(key)
        ? { requestId: deps.nextRequestId(), input: request }
        : request
      const parsedRequest = contract.request.parse(wire)
      return contract.response.parse(await deps.invoke(P15_IPC[key], parsedRequest))
    }
  }
  return Object.freeze(api) as P15BackendApi
}
