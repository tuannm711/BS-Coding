# opencode Gap Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Replace a twenty-day-old belief about what is missing with a measured
statement, and correct the documents that repeated it.

**Architecture:** Documentation only. The audit lands first because everything
else cites it.

**Tech Stack:** Markdown, the existing design-doc guards.

## Global Constraints

- Do not edit `docs/superpowers/notes/2026-08-05-opencode-feature-diff.md` beyond
  adding a superseded banner at the top. Its content is the record of what was
  believed on that date.
- Do not build any of the audited features. This plan produces a list, not code.
- Every claim in the audit names the file or symbol that settles it, and the
  cited-path guard must pass on it.
- Do not add a content-level guard. Record it as debt.
- Test baseline: 142 files, **1019** tests. This plan adds none; the count must
  not change.
- Do not tag or bump the version.

---

### Task 1: The dated audit

**Files:**
- Create: `docs/superpowers/audits/2026-08-25-opencode-gap-audit.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the document every later task cites.

- [ ] **Step 1: Write it**

Structure:

- A heading naming the date and what it was measured against — BS Coding at
  v1.1.4, opencode 1.18.11 as described by the 2026-08-05 note.
- One paragraph stating why it exists: the note was the agreed next-work list and
  half of it is already built.
- A table with one row per high-value item: number, item, what the note claimed,
  what is true now, and the evidence — a path or a symbol.
- A section per partly-built item saying exactly what exists and what does not.
  Three of them: cost stats, session title, compaction.
- A closing section listing what genuinely remains, ordered.

Evidence to cite, all verified:

| # | Verdict | Evidence |
|---|---|---|
| 1 | Built | `src/main/agent/commands.ts`, 18 built-in commands |
| 2 | Mostly built | `src/main/agent/snapshot.ts` — `undoTurn`, `pushTurn` |
| 3 | Partly built | `src/main/agent/usage.ts` — `calcCost`; `StatsSummary` used only in `src/main/bs-agent-manager.ts` |
| 4 | Built | `src/main/agent/lsp/client.ts`, `manager.ts`, `servers.ts` |
| 5 | Built | `src/main/file-watcher.ts` |
| 6 | Built | `src/main/agent/truncation.ts` |
| 7 | Partly built | `renameSession` in `src/shared/ipc.ts`; title still `titleFrom` in `src/main/agent/session.ts` |
| 8 | Partly built | `pruneToolOutputs` in `src/main/agent/compact.ts`; no auto-continue |

- [ ] **Step 2: Confirm every cited path exists**

```bash
node -e "const fs=require('fs');const raw=fs.readFileSync('docs/superpowers/audits/2026-08-25-opencode-gap-audit.md','utf8');const paths=[...new Set([...raw.matchAll(/\`((?:src|tests|scripts|docs)\/[^\`]+)\`/g)].map(m=>m[1].replace(/:\d+$/,'')))];const missing=paths.filter(p=>!fs.existsSync(p));console.log(missing.length?'MISSING: '+missing.join(', '):'every cited path exists ('+paths.length+')')"
```

Expected: `every cited path exists`.

- [ ] **Step 3: Commit**

`docs: audit the opencode gap list against v1.1.4`

---

### Task 2: Supersede the note and correct the debt

**Files:**
- Modify: `docs/superpowers/notes/2026-08-05-opencode-feature-diff.md` (banner only)
- Modify: `docs/technical-debt.md`

- [ ] **Step 1: Banner the note**

Insert directly under its title, changing nothing else:

```markdown
> **Superseded by `docs/superpowers/audits/2026-08-25-opencode-gap-audit.md`.**
> Measured against the code twenty days later, four of the eight high-value items
> below are built and three are partly built. This file is kept as the record of
> what was believed on 2026-08-05.
```

- [ ] **Step 2: Correct debt item 9**

It currently lists all eight items as open. Replace its list with what the audit
found open — cost stats UI, LLM session title, compaction auto-continue, and
per-message undo if per-turn proves insufficient — and point at the audit rather
than the note.

- [ ] **Step 3: Add debt item 11**

Title: "No guard checks whether a design sentence is true." Body: the
documentation tests verify that a table of contents matches its content and that
a cited path exists; neither can evaluate a claim. Two false statements reached
`docs/design/` on their first day, both written by citing debt item 9 instead of
reading the code. Note that a possible approach — requiring each Known limits
sentence to name a symbol and failing if that symbol exists — is prone to false
positives and was deliberately not attempted.

- [ ] **Step 4: Update the debt index table and the review date**

Both live at the top of `docs/technical-debt.md`.

- [ ] **Step 5: Commit**

`docs: supersede the gap note and correct the debt it fed`

---

### Task 3: Correct the two design documents

**Files:**
- Modify: `docs/design/02-agent-runtime.md`
- Modify: `docs/design/05-sessions.md`

- [ ] **Step 1: Fix `02-agent-runtime.md` Known limits**

It claims compaction does not prune and there is no auto-continue. Pruning
exists — `pruneToolOutputs`, gated on `cfg.prune`. Only auto-continue is
missing. Rewrite to say that, and keep the per-message undo point but state it
accurately against `undoTurn`.

- [ ] **Step 2: Fix `05-sessions.md` Known limits**

It claims there is no redo history beyond the last turn. `pushTurn` re-inserts a
turn so it can be undone again, and `undoTurn` targets a turn by id rather than
only the most recent. Rewrite to say undo and redo are turn-granular, and that
message granularity is what is missing.

- [ ] **Step 3: Regenerate and verify the guards**

```bash
npm run docs:toc && npx vitest run tests/unit/design-docs.test.ts
```

Expected: tocs current, cited paths real, 34 tests passing.

- [ ] **Step 4: Commit**

`docs: correct two design limits that repeated a stale note`

Body must name the cause: both sentences were written by citing debt item 9
rather than reading the code.

---

### Task 4: Verify and propose

**Files:** none modified.

- [ ] **Step 1: Full verification**

```bash
npm test && npm run typecheck
```

Expected: exit 0 from both, **1019** tests. Check the exit status, not a grep of
the output — this session has twice mistaken a progress line for a summary, and
twice committed against a red run.

- [ ] **Step 2: Confirm no claim survives that the audit contradicts**

```bash
grep -rn "does not prune\|no redo history\|no per-message revert" docs/
```

Expected: no match outside the archive.

- [ ] **Step 3: Report, propose, and stop**

Report the audit result and propose an order for what genuinely remains, judged
against the multi-account goal rather than against opencode parity. Do not merge
or start any of it; wait for the final approval gate.
