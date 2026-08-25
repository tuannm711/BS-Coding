# opencode gap audit — design

Date: 2026-08-25
Branch: `docs/opencode-gap-audit`
Release: none — documentation only

## Problem

`docs/superpowers/notes/2026-08-05-opencode-feature-diff.md` is the list the
project agreed to work from next. Checked against the code twenty days later,
four of its eight high-value items are built, three are partly built, and one is
not started.

| # | Item | The note says | Measured today |
|---|---|---|---|
| 1 | Slash commands and templates | "Không có gì" | Built — 18 commands, `$ARGUMENTS`, `@path`, `` !`cmd` `` |
| 2 | Per-message undo/redo | "Chỉ revert tool toàn bộ" | `undoTurn(scopeId, turnId)` targets any turn; `pushTurn` is redo |
| 3 | Cost and usage stats | "Chỉ raw token mỗi turn" | `calcCost` and `StatsSummary` exist; no renderer surface |
| 4 | LSP tools and diagnostics | "Không có" | Built — `client.ts`, `manager.ts`, `servers.ts` |
| 5 | File watcher | "Không có" | Built — `src/main/file-watcher.ts` |
| 6 | Tool output truncation service | "Cắt cứng" | Built — `TruncationStore` with configurable caps |
| 7 | LLM session title and rename | "Không rename" | Rename built; title still heuristic |
| 8 | Compaction prune and auto-continue | "Không có" | `pruneToolOutputs` built; auto-continue not |

Planning from that list would have meant proposing work already done.

**Two design documents written yesterday repeat the note's staleness.**
`docs/design/02-agent-runtime.md` states that compaction does not prune, and
`docs/design/05-sessions.md` that there is no redo history. Both are wrong:
`pruneToolOutputs` exists and its own comment says it mirrors opencode's
`compaction.prune`, and `pushTurn` is the redo path.

The cause is specific and worth naming. Both sentences were written by citing
debt item 9 rather than reading the code. The design documents exist to stop
exactly that, and the first draft did it anyway.

## Approach

**Write a dated audit, do not edit the note.** A new file at
`docs/superpowers/audits/2026-08-25-opencode-gap-audit.md` carries the table
above with the evidence for each row — the file or symbol that settles it. The
note keeps its content and gains a banner saying it is superseded and by what.
Editing it in place would destroy the record of what was believed on 2026-08-05,
which is the only thing an archive is for.

**Correct the two design documents.** The Known limits sections of
`02-agent-runtime.md` and `05-sessions.md` are rewritten against the code.

**Correct debt item 9.** It lists the eight high-value items as open. It is
reduced to what is actually open, pointing at the new audit.

**Record a new debt item about the limits of the guards.** The documentation
tests check that a table of contents matches its content and that a cited path
exists. Neither can tell whether a sentence is true. That is a real gap in the
arrangement, and it has already produced two false statements.

## Verification

1. Every row of the audit names a file or symbol, and each of those exists.
2. `docs/design/02-agent-runtime.md` and `05-sessions.md` no longer claim
   pruning and redo are missing.
3. The design-doc guards still pass — tocs current, cited paths real.
4. `npm test` and `npm run typecheck` pass.
5. A fresh read of debt item 9 matches the audit rather than the note.

## Risks

**The audit itself goes stale.** It is dated in its filename and its heading, and
it says what it was measured against, so a reader can judge its age. That is the
best available guarantee for prose.

**Partial items are miscategorised.** Three rows are "partly built", which is a
judgement, not a fact. Each states precisely what exists and what does not rather
than resting on the label.

## Out of scope

**Building any of the remaining items.** The audit produces a prioritised list;
what to do with it is the next decision.

**A content-level guard for design documents.** Recorded as debt instead — see
above.

**Re-auditing the medium-value and skipped groups.** The high-value list is what
the project agreed to work from. The other groups can be audited when they are
about to matter.

## Success criteria

A dated audit exists with per-row evidence; the note says it is superseded; the
two wrong Known limits are corrected; debt item 9 reflects reality; a new debt
item records that no guard checks whether a design sentence is true.
