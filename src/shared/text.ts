export function appendStreamDelta(buffer: string, delta: string): string {
  // Deltas contain new text. An overlapping suffix can be legitimate repeated
  // prose, whitespace or Markdown, so content alone cannot identify a replay.
  return buffer + delta
}
