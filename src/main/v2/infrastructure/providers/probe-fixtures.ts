import type { ProbePart, ProbeRuntime } from '../../application/providers/capability-probe'

export function fakeProbeRuntime(
  parts: readonly ProbePart[],
  options: { structuredTools?: boolean } = {}
): ProbeRuntime {
  return {
    declaredStructuredTools: options.structuredTools,
    async *probe() {
      for (const part of parts) yield structuredClone(part)
    }
  }
}
