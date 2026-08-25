# Design documentation — design

Date: 2026-08-25
Branch: `docs/design-documentation`
Release: none — documentation only, merges without a tag

## Problem

The project has 187 markdown files and no design documentation.

| Kind | Count | What it is |
|---|---|---|
| `superpowers/specs` + `plans` | 162 | One task at one moment, frozen |
| Changelogs | 11 | Release history |
| Distributed `AGENTS.md` | 16 | Per-directory conventions, 10–70 lines |
| Evidence, notes, audits | 6 | Verification records |
| README | 1 | Product introduction, 189 lines |
| **Design documentation** | **0** | — |

87% of the corpus describes *a change that was made*, not *what the system is*.
Nothing answers "how does feature X work today".

This has a measured cost. The session that produced this spec had to rediscover,
by instrumenting the running app, that `providerError` is stored at account level
while its message names a single model; that `ProviderUsage.status` had four
values of which one was read; and that the ChatGPT auth claim prefixes its keys
with `chatgpt_`. None of that was written down anywhere. Each rediscovery cost a
build-and-measure cycle.

Two things already work and must survive: the **distributed `AGENTS.md`
convention** — short, near the code, per directory — and the **README**, which
introduces the product well. Neither is replaced.

## Approach

Add `docs/design/`: one overview that indexes into eight domain documents.

```
docs/design/
  README.md              overview, index into the detail files, current/next/debt
  01-process-model.md    main / preload / renderer / shared, the IPC contract
  02-agent-runtime.md    native BS agent, tool registry, MCP, LSP, compaction
  03-providers.md        adapters, OAuth, quota, multi-account routing
  04-terminal-panes.md   PTY lifecycle, xterm host, pane grid
  05-sessions.md         sessions, snapshots, undo/redo, artifacts
  06-ui-shell.md         sidebar, right panel, settings, title bar, tray
  07-build-release.md    electron-builder, signing, CI, auto-update
  08-remote-control.md   WS relay and pairing, under development
```

Each detail document answers, for its domain: what the pieces are, how data flows
between them, which types carry it, and **which design decisions were made and
why**. The last is what the 162 plans cannot provide — they record what changed,
not what holds.

`docs/design/README.md` additionally carries three sections the user asked for:

- **Current work** — what is in flight, with its branch
- **Next work** — what is agreed to come next, in order
- **Debt** — a pointer to `docs/technical-debt.md`, never a copy of it

Duplicating debt into two files guarantees they diverge; the same failure mode as
the duplicated quota state machine fixed in v1.1.4.

## Tables of contents

Every file opens with a TOC listing each section, its anchor, and its **line
number**.

Line numbers rot the moment anyone edits above them, and Markdown will not
complain. A wrong TOC is worse than no TOC, so the numbers are generated and
guarded rather than hand-written:

- `scripts/build-docs-toc.mjs` rewrites the TOC block of every file under
  `docs/design/`, between `<!-- toc -->` and `<!-- /toc -->` markers.
- `npm run docs:toc` runs it.
- A unit test regenerates each TOC in memory and fails if it differs from what is
  committed.

This is the arrangement that already keeps `resources/tray-icon.png` from drifting
from `build/icons/32x32.png`: generate it, commit it, and let a test fail when the
two disagree.

The overview's index into the detail files carries line numbers too, so a reader
can jump to `03-providers.md:142` rather than scrolling.

## The 162 historical documents stay where they are

They are evidence and they are referenced from commit messages and from memory.
Moving them breaks those references for no gain.

Instead, `docs/design/README.md` and `docs/AGENTS.md` state plainly that
`docs/superpowers/` is a process archive — the record of how the project got
here — and that `docs/design/` is the reference for what it is now. A reader who
knows which is which will not mistake a plan from 2026-08-04 for current truth.

## Standardising the rest

The review pass covers the remaining documents, not the archive:

| File | Action |
|---|---|
| `README.md` | Link to `docs/design/` for the technical reference. No rewrite — it introduces the product well. |
| `AGENTS.md` (root) | Point at `docs/design/` for architecture; keep conventions. |
| `docs/AGENTS.md` | State what each subdirectory holds and which is authoritative. |
| Distributed `AGENTS.md` × 14 | Verify each still matches its directory; fix drift. No restructuring. |
| `docs/changelog-format.md` | Keep as is; it is followed and current. |
| Loose docs in `docs/` | `bs-coding-migration.md`, `katalon-setup.md`, `chatgpt-web-smoke-test.md`, `provider-assignment-recovery.md`, `remote-control.md` — verify each is current, and either link it from the matching design document or mark it superseded. |

Five files mention the former "meow" name. Each is checked and corrected where
the name is presented as current rather than historical.

## Verification

1. `npm run docs:toc` produces no diff on a clean tree — the committed TOCs match
   their content.
2. The TOC guard test fails when a heading is added to a design file without
   regenerating, and passes after.
3. Every link from `docs/design/README.md` to a detail file resolves, and every
   detail file exists.
4. Every source path cited in a design document exists in the repo. A test walks
   the cited paths and fails on any that does not.
5. `npm test` and `npm run typecheck` pass.
6. Read `docs/design/03-providers.md` against the v1.1.4 provider code and
   confirm it describes what the code does — this is the domain the session knows
   best, so it is the honest check on whether the format carries real
   understanding.

## Risks

**The documents drift from the code.** Unavoidable for prose. Verification steps
1–4 keep the mechanical parts honest — TOCs, links, cited paths — which is what
usually rots first. The prose remains a review responsibility.

**Eight documents is too much structure for the current codebase.** Possible.
The domains were drawn from the actual `src/` layout rather than invented, and
each maps to a directory or a coherent group of them.

**Writing them surfaces defects.** Likely, based on this session. Anything found
goes to `docs/technical-debt.md`, not into an unplanned fix.

## Out of scope

**Rewriting README.md.** It works.

**Restructuring or moving `docs/superpowers/`.** See above.

**Fixing anything the writing uncovers.** Record it as debt.

**API reference generated from source.** A different tool and a different
decision.

## Success criteria

`docs/design/` exists with an overview and eight domain documents; every TOC is
generated and guarded by a test; the overview indexes the detail files with line
numbers and carries current work, next work and a pointer to debt; the remaining
non-archive documents have been checked and corrected; tests and typecheck pass.
