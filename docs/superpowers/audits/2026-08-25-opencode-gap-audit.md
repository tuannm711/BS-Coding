# opencode gap audit — 2026-08-25

Measured: BS Coding at v1.1.4, against the high-value list in
`docs/superpowers/notes/2026-08-05-opencode-feature-diff.md`, which compared the
project to opencode 1.18.11.

That note is the list the project agreed to work from next. Checked against the
code twenty days later, half of it is already built. Planning from it would have
meant proposing work that is done.

## Verdicts

| # | Item | The note claimed | Measured today | Evidence |
|---|---|---|---|---|
| 1 | Slash commands and prompt templates | "Không có gì" | **Built** | `src/main/agent/commands.ts` — 18 built-ins, `$ARGUMENTS`, `@path`, `` !`cmd` `` |
| 2 | Per-message undo/redo | "Chỉ revert tool toàn bộ" | **Mostly built** | `src/main/agent/snapshot.ts` — `undoTurn`, `pushTurn` |
| 3 | Cost and usage stats | "Chỉ raw token mỗi turn" | **Partly built** | `src/main/agent/usage.ts` — `calcCost`; `StatsSummary` reaches only `src/main/bs-agent-manager.ts` |
| 4 | LSP tools and diagnostics | "Không có" | **Built** | `src/main/agent/lsp/client.ts`, `manager.ts`, `servers.ts` |
| 5 | File watcher / auto-context | "Không có" | **Built** | `src/main/file-watcher.ts` |
| 6 | Tool output truncation service | "Cắt cứng trong toLlmMessages" | **Built** | `src/main/agent/truncation.ts` |
| 7 | LLM session title and rename | "Auto-title heuristic, không rename" | **Partly built** | `renameSession` in `src/shared/ipc.ts`; title still `titleFrom` in `src/main/agent/session.ts` |
| 8 | Compaction auto-continue and prune | "Compact nhưng không auto-continue/prune" | **Built** | `pruneToolOutputs` in `src/main/agent/compact.ts`; `compactIfOverThreshold` runs in-loop and the turn continues |

Five built, three partly, none untouched.

## The partly-built items, precisely

**Item 2 — undo and redo.** `undoTurn(scopeId, turnId)` restores every file a
named turn touched, and it addresses a turn by id rather than only the most
recent one. `pushTurn` re-inserts a turn so the change can be undone again, which
is redo. What the note wanted and does not exist is **message** granularity: a
turn is the smallest unit that can be reverted, because `turnId` is the finest
identity the transcript carries.

**Item 3 — cost and stats.** `calcCost` prices a turn against `ModelPrice`, and
`addUsage` accumulates. `StatsSummary` is declared in `src/shared/types.ts` and
computed in `src/main/bs-agent-manager.ts`. Nothing in `src/renderer` reads it,
so the numbers exist and cannot be seen. What is missing is a surface, not a
calculation.

**Item 7 — session title.** `renameSession` and `renameProjectSession` are in the
IPC contract, so renaming works. The automatic title is still
`titleFrom` / `titleFromItems` — a heuristic over the first message text. There
is no title prompt and no model call.

**Item 8 — compaction. Corrected after a second reading.** Both halves are
built. `pruneToolOutputs` drops old tool output when `cfg.prune` is set, and
`compactIfOverThreshold` runs at the top of every step in `src/main/agent/loop.ts`
before the messages are built, so the turn continues into the next model call —
there is no interruption to resume from.

What exists instead of a gap is a cap and a blind spot. `MAX_COMPACT_PER_RUN` is
2; past that the turn proceeds with a context known to be over the limit.
And detection is proactive only: a provider that rejects a request for length is
not recovered from.

The first draft of this audit called item 8 partly built, repeating the note's
claim without reading `loop.ts`. That is the same failure the audit was written
to correct, made inside the correction.

## Closed on 2026-08-25

All four were built in `feat/close-opencode-gaps`, in the order below.

| # | Item | Commit | What landed |
|---|---|---|---|
| 1 | Stats surface | `d5a92ed` | A Usage tab reading `window.api.getStats()`, which nothing had called |
| 2 | Compaction robustness | `147a9ff`, `d8ab907` | `context-overflow` as its own error kind, and a forced compaction plus one retry per step |
| 3 | LLM session title | `752e7c9` | One short request per session, guarded against repeats and user renames |
| 4 | Call-granular undo | `e78440f` | `undoCall` on the tool call id the transcript already carried |

Two estimates in the list below were wrong when written, both claiming something
absent that was partly present. Item 2's auto-continue already existed; what was
missing was recovery from a provider rejection. Item 4 was said to need a finer
identity in the transcript; the identity was there and simply unused.

## What was thought to remain

Ordered by what the multi-account goal needs, not by opencode parity.

1. **A stats surface.** The data is computed and thrown away. This is the
   cheapest item on the list and it directly serves routing: knowing what each
   account has actually cost is the other half of knowing what quota it has left.
2. **Compaction robustness.** Not a missing feature — a cap and a blind spot.
   Past `MAX_COMPACT_PER_RUN` the turn runs with an over-limit context, and a
   provider rejection for length is not recovered from. Both matter more when a
   coordinator is driving long turns it expects to finish.
3. **LLM session titles.** Cosmetic against the product goal. Cheap, and it makes
   a project with many sessions navigable.
4. **Message-granular undo.** Needs a finer identity than `turnId` in the
   transcript, so it is the largest of the four and the least urgent.

## A note on why this audit was needed

Two sentences in `docs/design/` were written on 2026-08-24 by citing debt item 9
rather than reading the code, and both were wrong — they said compaction does not
prune and that there is no redo history. The design documents exist to prevent
exactly that. The documentation guards check that a table of contents matches its
content and that a cited path exists; neither can tell whether a sentence is
true. That gap is recorded as debt item 11.
