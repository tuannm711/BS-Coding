import type {
  BsV2Api,
  ProjectionEvent,
  WorkSessionCreateInput
} from '../shared/v2/contracts/ipc'
import type { WorkflowRun } from '../shared/v2/contracts/domain'
import { V2_IPC } from '../shared/v2/contracts/ipc'
import {
  V2PublicIpcSchemas,
  WorkflowProjectionEventSchema
} from '../shared/v2/schemas/ipc'
import type { z } from 'zod'

type Listener = (event: unknown, payload: unknown) => void

export const PUBLIC_V2_API_KEYS = Object.freeze([
  'provider.listAccounts',
  'workflow.get',
  'workflow.subscribe',
  'workSession.create',
  'workSession.pause'
] as const)

export function resolveV2Enabled(argv: readonly string[]): boolean {
  return argv.includes('--bs-v2-enabled=1')
}

export function createV2Api(deps: {
  invoke(channel: string, payload: unknown): Promise<unknown>
  on(channel: string, listener: Listener): void
  removeListener(channel: string, listener: Listener): void
  nextRequestId(): string
  enabled?: boolean
}): BsV2Api {
  const invoke = async <T>(channel: string, request: unknown, response: z.ZodType<T>): Promise<T> =>
    response.parse(await deps.invoke(channel, request))
  return Object.freeze({
    enabled: deps.enabled === true,
    workSession: Object.freeze({
      create: (input: WorkSessionCreateInput) => {
        const request = V2PublicIpcSchemas['workSession.create'].request.parse({
          requestId: deps.nextRequestId(), input
        })
        return invoke(V2_IPC.workSession.create, request,
          V2PublicIpcSchemas['workSession.create'].response)
      },
      pause: (id: string) => {
        const request = V2PublicIpcSchemas['workSession.pause'].request.parse({
          requestId: deps.nextRequestId(), input: { id }
        })
        return invoke(V2_IPC.workSession.pause, request,
          V2PublicIpcSchemas['workSession.pause'].response)
      }
    }),
    provider: Object.freeze({
      listAccounts: () => invoke(V2_IPC.provider.listAccounts,
        V2PublicIpcSchemas['provider.listAccounts'].request.parse({}),
        V2PublicIpcSchemas['provider.listAccounts'].response)
    }),
    workflow: Object.freeze({
      get: (id: string) => invoke(V2_IPC.workflow.get,
        V2PublicIpcSchemas['workflow.get'].request.parse({ id }),
        V2PublicIpcSchemas['workflow.get'].response),
      subscribe: (workflowRunId: string,
        callback: (event: ProjectionEvent<WorkflowRun>) => void) => {
        const listener: Listener = (_event, payload) => {
          const event = WorkflowProjectionEventSchema.parse(payload)
          if (event.payload.id === workflowRunId) callback(event)
        }
        deps.on(V2_IPC.workflow.projection, listener)
        return () => deps.removeListener(V2_IPC.workflow.projection, listener)
      }
    })
  })
}
