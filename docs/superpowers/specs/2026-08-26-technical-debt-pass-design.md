# Paying down technical debt items 1, 4, 12, 13 — design

Date: 2026-08-26
Branch: `chore/pay-down-technical-debt`
Release: v1.1.7

## What this covers, and what it leaves

`docs/technical-debt.md` holds thirteen entries. Four are closed here. The other
nine are left, each for a stated reason rather than by omission:

| # | Item | Why it is not in scope |
|---|---|---|
| 2 | Quota reasons carry no group scope | Waits on routing requirements that do not exist yet |
| 3 | No quota-health signal for routing | Same; reviving a threshold nobody chose is what created it |
| 5 | Only two providers report usage | Provider feature work, not cleanup; belongs with routing |
| 6 | Antigravity reports no term | Won't fix |
| 7 | Google OAuth client secret | Accepted by the owner; a product decision |
| 8 | Tray artwork not platform-specific | Needs an artwork decision, deferred to its own pass |
| 9 | opencode feature gaps | Closed; the entry is kept deliberately as a lesson |
| 10 | Test runner crashes intermittently | The entry says not to chase it without a captured instance |
| 11 | No guard checks a design sentence | No clean mechanism is known |

## 1. Test files are typechecked by nothing

**Measured, not assumed.** A throwaway config covering `tests/` with `strict`,
`lib: ["ES2022", "DOM"]`, `types: ["node"]` and `src/renderer/src/env.d.ts`
produces **77 errors, all inside `tests/`, none in `src/`**. Without `env.d.ts`
the count is 284, because renderer components pulled in by tests lose the ambient
`window.api` declaration. That file is what makes a single config viable.

Two real defects are already visible in that output:

`tests/integration/provider-agent-chat.test.ts` and
`tests/integration/shared-session-agent-switch.test.ts` both import
`type SnapshotEntry` from `src/main/agent/snapshot`. No such export exists; the
type is `SnapshotTurn`. Both suites pass, because vitest erases types without
checking them.

`tests/e2e/smoke.spec.ts:268` reads `window.innerWidth` inside an
`element.evaluate` callback. In that file `window` is a local variable holding an
Electron `Page`, so the type resolves to `Page`, which has no `innerWidth`. It
works at runtime — the callback is serialised into the browser, where `window` is
the DOM window — but the name is shadowed and the assertion holds by luck.

**Approach.** One `tsconfig.test.json` at the repo root, not two. Tests import
both main-process and renderer modules, so splitting by target would mean
splitting the test directory on an artificial line. `types` also carries
`@playwright/test`, which is already a dev dependency, so `tests/e2e` is covered
rather than excluded. The config joins the `typecheck` script chain.

Errors are fixed by correcting the fixture to match the real type. Casts are not
used: a cast disables the check this item exists to enable. Where making a
fixture honest changes what a test asserts, that case is reported individually
rather than folded into a total.

## 4. `unavailableReason` is a misleading name

After the v1.1.2 status narrowing, a 429 yields `status: 'ok'` together with
`unavailableReason: 'Quota exhausted'`, which reads as a contradiction. The field
means "why the last refresh degraded". Renaming it to `statusReason` touches 21
sites in `src/` and 5 test files.

**A constraint the debt entry missed.** The field is persisted:
`connections/accounts.json` contains `unavailableReason` for real accounts. A
plain rename makes every stored account lose its reason on the next load, until
the following quota refresh recomputes it.

The consequence is small — the string is transient and regenerated on each
refresh — but it is handled deliberately: when account records are read, a
normalisation accepts either key and yields `statusReason`. Only the new key is
written. No migration runs, and no stored file is rewritten.

The debt entry suggests doing this alongside item 2. Item 2 is blocked
indefinitely, so waiting means never. The rename stands alone and does not
constrain item 2 when it comes.

## 12. The narrated-call notice is never rendered in a test

`ChatPanel.tsx` is 1036 lines and renders every feed row inline inside one
`items.map`. The `notice` row added in v1.1.6 has never executed.

**Approach.** Extract a pure `FeedRow` component into
`src/renderer/src/components/chat/FeedRow.tsx`, taking a `FeedItem` and the
handlers the rows need (`commands`, `onOpenImage`, `onOpenFile`, `onOpenSubagent`)
as props, holding no state. `FeedItem` moves there too, since it is the
component's input. `ChatPanel` maps over items and renders `FeedRow`.

This follows the pattern already in the codebase: `formatStatsRows` and
`StatsView` were split out of `StatsTab` so they could be asserted with
`renderToStaticMarkup` under `environment: 'node'`. The `notice`, `compaction`,
`error` and `subagent` rows are testable that way. The `message` and `tool` rows
delegate to `FeedMessage` and `ToolCallCard`, which are unchanged.

## 13. Narration is detected only as it is written

`looksLikeNarratedToolCall` runs in the manager's `appendMessage`, so narration
raises its notice as it happens and never on reopening a session. The 17 narrated
messages in the affected session stay invisible, which is how they went unnoticed.

**Approach.** Move the detector to `src/shared/narrated-tool-call.ts`.
`neutral-context.ts` imports it from there, so main-process behaviour is
unchanged, and the renderer can use it too — `src/main` is not importable from
`src/renderer`. In `loadTranscript`, an assistant message matching the pattern is
followed by a `notice` feed item.

`ChatTranscriptItem` does not change and no stored data is rewritten. The notice
is derived at render time from text already on disk.

## Ordering

Item 1 first. It is the net under the other three: item 4 edits five test files,
and until `tests/` is typechecked a broken fixture there fails exactly the way
this entry describes. Then 4, then 12, then 13.

## Verification

1. `npx tsc --noEmit -p tsconfig.test.json` exits 0, and `npm run typecheck`
   includes it.
2. The two `SnapshotEntry` imports name `SnapshotTurn`, and `smoke.spec.ts` no
   longer reads `innerWidth` off a shadowed `window`.
3. No `as` cast was added to silence a fixture error. Checked by reading the
   diff, since no tool can distinguish a necessary cast from a lazy one.
4. `statusReason` replaces `unavailableReason` throughout `src/`, and an account
   record stored with the old key still yields a reason when read.
5. `FeedRow` renders each of `notice`, `compaction`, `error` and `subagent` under
   `renderToStaticMarkup`, asserted on the emitted markup.
6. A transcript containing an assistant message in the record shape yields a
   notice on load; one without does not.
7. `npm test` and `npm run typecheck` pass, checked by exit status.
8. The app runs: a quota card still shows its reason, and a session with stored
   narration shows the notice on reopening.

## Risks

**The 77 errors are not 77 fixes.** Several share a cause — a `BsSettings`
fixture missing eight fields appears eight times. The count is an upper bound on
work, not a lower bound, but it could also grow: fixing one error can reveal
another the compiler could not reach past it.

**Making a fixture honest changes what its test proves.** A fixture with all
required fields present may take a different branch than the partial one did.
This is the point of the item, not a side effect, but it means some assertions
will need rewriting rather than the fixture alone. Each such case is reported.

**`FeedRow` changes rendering by accident.** The rows move verbatim, and the
extraction is covered by rendering assertions that do not exist today. The
remaining risk is a prop threaded wrongly, which typecheck catches.

**The renderer imports shared code that main also uses.** `src/shared` is already
imported by both, so this adds no new coupling.

## Out of scope

**Fixing `ChatPanel` beyond the extraction.** It stays large. Only the feed rows
move.

**Deleting debt entry 9.** It is closed and kept on purpose, as a record of a
summary that was wrong twice.

**Typechecking `scripts/`.** Not covered today either, and no drift has been
found there.

## Success criteria

`tests/` is typechecked in CI and locally, and the two defects that discovery
already found are fixed. `statusReason` names what the field means, and an
account stored under the old name still reads. The feed rows render under test.
A session reopened with narration in it says so.
