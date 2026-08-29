import type { CapabilityHealth } from '../../../../shared/v2/contracts/provider'

export type ProbePart =
  | { kind: 'text-delta'; text: string }
  | { kind: 'tool-call'; callId: string; toolName: string; arguments: unknown }
  | { kind: 'finish'; reason: string }

export interface ProbeRuntime {
  readonly declaredStructuredTools?: boolean
  probe(): AsyncIterable<ProbePart>
}

export interface CapabilityProbeResult {
  structuredTools: CapabilityHealth
  streaming: boolean
  reasoning: CapabilityHealth
}

export async function probeStructuredTools(runtime: ProbeRuntime): Promise<CapabilityProbeResult> {
  if (runtime.declaredStructuredTools === false) {
    return { structuredTools: 'UNSUPPORTED', streaming: false, reasoning: 'UNKNOWN' }
  }
  let sawStructuredCall = false
  let sawText = false
  for await (const part of runtime.probe()) {
    if (part.kind === 'tool-call') sawStructuredCall = true
    if (part.kind === 'text-delta') sawText = true
  }
  return {
    structuredTools: sawStructuredCall ? 'VERIFIED' : sawText ? 'DEGRADED' : 'UNKNOWN',
    streaming: sawText || sawStructuredCall,
    reasoning: 'UNKNOWN'
  }
}
