// The shape compileNeutralContext emits, and the shape it used to emit into the
// assistant role which models learned to reproduce. Both are anchored to a line
// start and require the line that follows, so prose mentioning a tool does not
// trip them.
//
// Lives in shared because two sides need it: the main process flags narration as
// it is written, and the renderer flags what a stored transcript already holds.
const NARRATED = /^(?:\[Tool [^\]\n]+ \u00b7 (?:completed|failed)\]\s*\r?\nInput:|\[Session log[^\]\n]*\]\s*\r?\n- )/m

export function looksLikeNarratedToolCall(text: string): boolean {
  return NARRATED.test(text)
}
