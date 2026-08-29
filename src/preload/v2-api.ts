import type { BsV2Api } from '../shared/v2/contracts/ipc'
import { V2_IPC } from '../shared/v2/contracts/ipc'
import { ProjectionEventSchema } from '../shared/v2/schemas/ipc'

type Listener = (event: unknown, payload: unknown) => void

export const PUBLIC_V2_API_KEYS = Object.freeze([
  'provider.listAccounts',
  'workflow.get',
  'workflow.subscribe',
  'workSession.create',
  'workSession.pause'
] as const)

export function createV2Api(deps: {
  invoke(channel: string, payload: unknown): Promise<unknown>
  on(channel: string, listener: Listener): void
  removeListener(channel: string, listener: Listener): void
  nextRequestId(): string
}): BsV2Api {
  const command = (channel: string, input: unknown): Promise<unknown> => deps.invoke(channel, {
    requestId: deps.nextRequestId(), input
  })
  return Object.freeze({
    workSession: Object.freeze({
      create: (input: { projectId: string; goal: string }) =>
        command(V2_IPC.workSession.create, input),
      pause: (id: string) => command(V2_IPC.workSession.pause, { id })
    }),
    provider: Object.freeze({
      listAccounts: () => deps.invoke(V2_IPC.provider.listAccounts, {})
    }),
    workflow: Object.freeze({
      get: (id: string) => deps.invoke(V2_IPC.workflow.get, { id }),
      subscribe: (callback: (event: ReturnType<typeof ProjectionEventSchema.parse>) => void) => {
        const listener: Listener = (_event, payload) => callback(ProjectionEventSchema.parse(payload))
        deps.on(V2_IPC.workflow.projection, listener)
        return () => deps.removeListener(V2_IPC.workflow.projection, listener)
      }
    })
  })
}
