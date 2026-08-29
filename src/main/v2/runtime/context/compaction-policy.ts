export type CompactionPlan =
  | { kind: 'NONE' }
  | { kind: 'COMPACT'; artifact: { id: string; sourceEventIds: string[] };
      event: { type: 'SUMMARY_CREATED'; artifactId: string } }

export function createCompactionPlan(input: {
  currentTokens: number
  maxInputTokens: number
  threshold: number
  events: readonly { id: string }[]
  summaryArtifactId: string
}): CompactionPlan {
  if (input.maxInputTokens <= 0 || input.threshold <= 0 || input.threshold > 1) {
    throw new RangeError('invalid compaction budget')
  }
  if (input.currentTokens < input.maxInputTokens * input.threshold) return { kind: 'NONE' }
  return {
    kind: 'COMPACT',
    artifact: { id: input.summaryArtifactId, sourceEventIds: input.events.map(event => event.id) },
    event: { type: 'SUMMARY_CREATED', artifactId: input.summaryArtifactId }
  }
}
