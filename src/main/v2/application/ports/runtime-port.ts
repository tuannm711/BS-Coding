import type { ContextPacket } from '../../../../shared/v2/contracts/context'
import type { RuntimeTarget } from '../../../../shared/v2/contracts/provider'
import type { RuntimeStreamPart } from '../../../../shared/v2/contracts/runtime'

export interface RuntimeRequest {
  context: ContextPacket
  maxOutputTokens?: number
  steering?: readonly string[]
}

export interface RuntimeClient {
  stream(request: RuntimeRequest, signal?: AbortSignal): AsyncIterable<RuntimeStreamPart>
  cancel(reason: string): Promise<void>
}

export interface RuntimePort {
  open(target: RuntimeTarget): Promise<RuntimeClient>
}
