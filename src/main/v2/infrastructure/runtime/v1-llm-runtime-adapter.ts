import type { Clock } from '../../application/ports/clock'
import type { RuntimeClient, RuntimePort, RuntimeRequest } from '../../application/ports/runtime-port'
import type { RuntimeTarget } from '../../../../shared/v2/contracts/provider'
import type { RuntimeStreamPart } from '../../../../shared/v2/contracts/runtime'

type LegacyPart =
  | { kind: 'text'; text?: string }
  | { kind: 'reasoning'; text?: string; thoughtSignature?: string }
  | { kind: 'tool-call'; toolCallId?: string; toolName?: string;
      toolInput?: Record<string, unknown>; thoughtSignature?: string }
  | { kind: 'finish'; finishReason?: string }
  | { kind: 'error'; error?: string }

interface LegacyClient {
  stream(input: { request: RuntimeRequest; signal?: AbortSignal }): AsyncIterable<LegacyPart>
  cancel?(reason: string): Promise<void>
}

// Delete after P20 cutover when every runtime is native V2 RuntimePort.
export class V1LlmRuntimeAdapter implements RuntimePort {
  constructor(
    private readonly createLegacy: (target: RuntimeTarget) => Promise<LegacyClient>,
    private readonly clock: Clock
  ) {}

  async open(target: RuntimeTarget): Promise<RuntimeClient> {
    const legacy = await this.createLegacy(target)
    return {
      stream: (request, signal) => this.normalize(legacy.stream({ request, signal })),
      cancel: async reason => { await legacy.cancel?.(reason) }
    }
  }

  private async *normalize(stream: AsyncIterable<LegacyPart>): AsyncIterable<RuntimeStreamPart> {
    for await (const part of stream) {
      if (part.kind === 'text') yield { kind: 'text-delta', text: part.text ?? '' }
      else if (part.kind === 'reasoning') yield { kind: 'reasoning-delta', text: part.text ?? '' }
      else if (part.kind === 'tool-call') yield { kind: 'tool-call', call: {
        callId: part.toolCallId ?? '', toolName: part.toolName ?? '',
        arguments: structuredClone(part.toolInput ?? {}), origin: 'model', requestedAt: this.clock.now()
      } }
      else if (part.kind === 'finish') yield { kind: 'finish', reason: part.finishReason ?? 'unknown' }
      else yield { kind: 'error', error: {
        code: 'LEGACY_RUNTIME_ERROR', message: part.error ?? 'unknown legacy runtime error'
      } }
    }
  }
}
