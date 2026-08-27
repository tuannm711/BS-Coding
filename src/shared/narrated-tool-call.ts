// Anchored on the record body, because that is the half a model reproduces:
// the header says in words that it is not a format to copy, so it is the half
// left behind. The owner's session had exactly that — the body alone, and the
// detector missed it because both its alternatives required the header.
//
// Nothing emits either shape any more; shared history is replayed as native
// tool calls. This is now a net for narration that recurs, and for transcripts
// already holding the old format.
//
// Lives in shared because two sides need it: the main process flags narration
// as it is written, and the renderer flags what a stored transcript holds.
// Three shapes, all of them anchored to a line start and requiring the line
// that follows, so prose mentioning a tool does not trip them:
//
//   1. the pre-v1.1.6 record, which the owner's store still holds 2 of
//   2. the [Session log …] header
//   3. the record body alone — the half a model actually reproduces, because
//      the header says in words that it is not a format to copy
//
// The plan for this change called (1) dead and proposed dropping it. Measuring
// the store said otherwise: 2 messages match it and 0 match (2). A net is
// cheap to keep wide, so all three stay.
//
// Nothing emits any of them now — shared history is replayed as native tool
// calls. This is what would tell us if that stopped working.
const NARRATED = new RegExp([
  '^\\[Tool [^\\]\\n]+ \\u00b7 (?:completed|failed)\\]\\s*\\r?\\nInput:',
  '^\\[Session log[^\\]\\n]*\\]\\s*\\r?\\n- ',
  '^- [a-z][\\w-]* \\u00b7 (?:completed|failed)\\s*\\r?\\n\\s+input:'
].join('|'), 'm')

export function looksLikeNarratedToolCall(text: string): boolean {
  return NARRATED.test(text)
}
