# Design Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Give the project a design reference that answers "how does this work
today", with tables of contents a machine keeps honest.

**Architecture:** Tooling lands first, so every document written afterwards is
guarded as it arrives. Then eight domain documents, then the overview that
indexes them, then a pass over the remaining non-archive docs.

**Tech Stack:** Node ESM scripts under `scripts/`, vitest, Markdown.

## Global Constraints

- Do not rewrite `README.md`. Add a link to `docs/design/` and nothing else.
- Do not move, rename or delete anything under `docs/superpowers/`.
- Do not fix defects found while writing. Add them to `docs/technical-debt.md`
  and keep writing.
- Every source path cited in a design document must exist. Task 1 adds the test
  that enforces this; do not cite a path you have not opened.
- TOC blocks are generated, never hand-edited. They live between
  `<!-- toc -->` and `<!-- /toc -->`.
- Line numbers in a TOC refer to the line of the heading in that same file.
- Test baseline: 141 files, **985** tests. Each task states its running total.
- Do not tag or bump the version. Documentation only.

## How to write a domain document

Every file under `docs/design/` follows the same shape, so a reader learns it
once:

```markdown
# <Domain>

One paragraph: what this domain is responsible for, and what it is not.

<!-- toc -->
<!-- /toc -->

## Pieces
Table: file path → responsibility. Only files that exist.

## Data flow
How a request or event moves through the pieces, in order.

## Types that carry it
The shared types involved, where they are declared, and what each field means
when the name does not say it.

## Design decisions
Each decision, and **why**. This is the section the 162 historical plans cannot
provide — they record what changed, not what holds. Cite the commit or spec
where a decision was made when one exists.

## Known limits
What this domain deliberately does not do. Link `docs/technical-debt.md` entries
by number rather than restating them.
```

Research each domain by reading its source before writing. A document that
paraphrases file names without describing behaviour is worse than none — it
looks authoritative and is not.

---

### Task 1: Documentation tooling

**Files:**
- Create: `scripts/build-docs-toc.mjs`
- Create: `tests/unit/design-docs.test.ts`
- Modify: `package.json` (add `docs:toc` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `renderToc(markdown: string): string` — the TOC block body for a document
  - `applyToc(markdown: string): string` — the document with its TOC block rewritten
  - `collectCitedPaths(markdown: string): string[]` — repo paths cited in backticks or links

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/design-docs.test.ts`:

```ts
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyToc, collectCitedPaths, renderToc } from '../../scripts/build-docs-toc.mjs'

const designDir = path.resolve('docs/design')
const designFiles = existsSync(designDir) ? readdirSync(designDir).filter(name => name.endsWith('.md')) : []

describe('design doc toc generator', () => {
  it('lists每 heading with its anchor and line number', () => {
    const doc = ['# Title', '', '<!-- toc -->', '<!-- /toc -->', '', '## First section', '', 'body', '', '### Nested bit'].join('\n')
    expect(renderToc(doc)).toBe([
      '| Section | Line |',
      '| --- | --- |',
      '| [First section](#first-section) | 6 |',
      '| &nbsp;&nbsp;[Nested bit](#nested-bit) | 10 |'
    ].join('\n'))
  })

  it('rewrites the toc block in place and is idempotent', () => {
    const doc = ['# Title', '', '<!-- toc -->', 'stale garbage', '<!-- /toc -->', '', '## Only section'].join('\n')
    const once = applyToc(doc)
    expect(once).toContain('[Only section](#only-section)')
    expect(once).not.toContain('stale garbage')
    expect(applyToc(once)).toBe(once)
  })

  it('leaves a document without toc markers untouched', () => {
    const doc = '# Title\n\n## Section\n'
    expect(applyToc(doc)).toBe(doc)
  })

  it('collects repo paths cited in a document', () => {
    const doc = 'See `src/main/index.ts` and [the card](src/renderer/src/components/quota/QuotaAccountCard.tsx) and `npm test`.'
    expect(collectCitedPaths(doc)).toEqual(['src/main/index.ts', 'src/renderer/src/components/quota/QuotaAccountCard.tsx'])
  })
})

describe('design docs stay honest', () => {
  it.each(designFiles)('%s has a current toc', name => {
    const raw = readFileSync(path.join(designDir, name), 'utf8')
    expect(applyToc(raw)).toBe(raw)
  })

  it.each(designFiles)('%s cites only paths that exist', name => {
    const raw = readFileSync(path.join(designDir, name), 'utf8')
    const missing = collectCitedPaths(raw).filter(cited => !existsSync(path.resolve(cited)))
    expect(missing).toEqual([])
  })
})
```

Replace `每` with `every` — it is a placeholder guard against copy-paste without
reading.

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/design-docs.test.ts
```

Expected: FAIL, cannot resolve `scripts/build-docs-toc.mjs`.

- [ ] **Step 3: Implement the generator**

Create `scripts/build-docs-toc.mjs`. It must:

- Treat lines starting `## ` and `### ` as sections; ignore `# ` and anything
  inside fenced code blocks.
- Render a two-column Markdown table, `### ` rows indented with two
  `&nbsp;&nbsp;`.
- Build anchors GitHub-style: lowercase, spaces to hyphens, drop anything that is
  not a letter, digit, hyphen or space.
- Report the heading's own 1-based line number.
- `applyToc` replaces only what is between the markers, returns input unchanged
  when either marker is absent, and is idempotent.
- `collectCitedPaths` returns backticked or linked strings that start `src/`,
  `tests/`, `scripts/`, `docs/` or `resources/`, deduplicated, in order. It must
  strip a trailing `:123` line suffix before returning the path.
- When run directly, rewrite every `docs/design/*.md` in place.

- [ ] **Step 4: Add the npm script**

In `package.json`, add to `scripts`:

```json
    "docs:toc": "node scripts/build-docs-toc.mjs",
```

- [ ] **Step 5: Run to confirm the tests pass**

```bash
npx vitest run tests/unit/design-docs.test.ts
```

Expected: PASS. The `it.each` blocks are empty for now — `docs/design/` does not
exist yet, and `it.each([])` registers no cases.

- [ ] **Step 6: Full suite and commit**

```bash
npm test && npm run typecheck
```

Expected: **989** tests. Commit as
`build: generate and guard design doc tables of contents`.

---

### Tasks 2–9: the eight domain documents

Each task creates one file under `docs/design/`, following **How to write a
domain document** above. Each ends the same way:

- [ ] **Step A: Research** — read the source listed for that task before writing.
- [ ] **Step B: Write** the document with empty `<!-- toc -->` / `<!-- /toc -->`
      markers in place.
- [ ] **Step C: Generate** — `npm run docs:toc`
- [ ] **Step D: Verify** — `npx vitest run tests/unit/design-docs.test.ts`.
      Both `it.each` guards now cover the new file. A failure means either a
      stale TOC or a cited path that does not exist.
- [ ] **Step E: Commit** — `docs: describe <domain>`

Do not batch. One document, one commit, so a reviewer can reject one without
unpicking the rest.

**Task 2 — `01-process-model.md`.** Read `src/main/index.ts`,
`src/preload/`, `src/shared/ipc.ts`, `electron.vite.config.ts`, and the four
tsconfig files. Cover: the three processes and what each may touch, the IPC
contract and how a channel is added, `contextBridge` and why `src/shared` must
not import Node or Electron, and the build projects. Note in Known limits that
`tests/` is in no tsconfig — debt item 1.

**Task 3 — `02-agent-runtime.md`.** Read `src/main/agent/` (31 files) and its
three nested `AGENTS.md`. Cover: the turn loop, the tool registry and how a tool
is added, MCP and LSP integration, compaction and truncation, permissions and
plan mode, skills.

**Task 4 — `03-providers.md`.** Read `src/main/providers/`,
`src/main/connections/`, `src/shared/provider-state.ts`, `src/shared/types.ts`
(the `ProviderUsage` block). Cover: the adapter interface and its four
implementations, OAuth and the vault, the quota model — groups, windows, tracked
periods — and how usage feeds account selection. Design decisions must include:
why `ProviderUsage.status` carries two values; why account-level exhaustion is
suppressed while a window has quota; why the ChatGPT subscription term is read
from the id_token claim rather than an HTTP call. Cite the v1.1.2 and v1.1.4
specs. This is the verification target in Task 11.

**Task 5 — `04-terminal-panes.md`.** Read `src/main/pty-manager.ts`,
`src/main/terminal-shell.ts`, `src/renderer/src/components/XtermHost.tsx`,
`Pane.tsx`, `PaneGrid.tsx`, `PaneHeader.tsx`. Cover: pty lifecycle and process
tree teardown, the prebuilt `@lydell/node-pty` binding and why no rebuild step
runs, xterm wiring and resize.

**Task 6 — `05-sessions.md`.** Read the session, snapshot and truncation stores
under `src/main/agent/`, plus `src/main/artifact-store.ts` and
`src/renderer/src/components/RightPanelArtifacts.tsx`. Cover: session
persistence, snapshot and revert, artifacts.

**Task 7 — `06-ui-shell.md`.** Read `src/renderer/src/components/` top level plus
`quota/`, `settings/`, `trace/`, and `src/main/window-chrome.ts`,
`src/main/tray-manager.ts`. Cover: window chrome per platform, sidebar, right
panel and its tabs, settings, tray and AppUserModelID, the quota cards.

**Task 8 — `07-build-release.md`.** Read `electron-builder.ts`,
`.github/workflows/build.yml`, `scripts/build-windows-icon.mjs`,
`scripts/sign-windows.ps1`, `src/main/updater.ts`. Cover: the build pipeline,
what ships and what does not, signing and its skip path, the tag-triggered
release, auto-update. Known limits must reference debt items 7 and 8.

**Task 9 — `08-remote-control.md`.** Read `src/main/remote/`,
`src/shared/remote-types.ts`, `docs/remote-control.md`. Cover the current state
honestly: this is under development, so say what exists and what does not rather
than describing an intention as if built.

---

### Task 10: The overview

**Files:**
- Create: `docs/design/README.md`
- Modify: `tests/unit/design-docs.test.ts`

**Interfaces:**
- Consumes: the eight documents from Tasks 2–9.
- Produces: the entry point for the whole reference.

- [ ] **Step 1: Write the failing link test**

Add to `tests/unit/design-docs.test.ts`:

```ts
describe('the design overview indexes the detail files', () => {
  const overview = readFileSync(path.join(designDir, 'README.md'), 'utf8')

  it('links to every domain document', () => {
    const linked = [...overview.matchAll(/\]\((\d{2}-[a-z-]+\.md)/g)].map(match => match[1])
    expect(linked.sort()).toEqual(designFiles.filter(name => /^\d{2}-/.test(name)).sort())
  })

  it('carries current work, next work and a pointer to debt', () => {
    expect(overview).toContain('## Current work')
    expect(overview).toContain('## Next work')
    expect(overview).toContain('docs/technical-debt.md')
  })

  it('does not restate the debt items', () => {
    expect(overview).not.toContain('Test files are typechecked by nothing')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Expected: FAIL, `docs/design/README.md` does not exist.

- [ ] **Step 3: Write the overview**

It must contain, in order: what BS Coding is in three sentences and a pointer to
`README.md` for the product view; an architecture section describing how the
domains relate; an index table with one row per domain document, its subject and
the line its TOC starts on; a paragraph stating that `docs/superpowers/` is a
process archive and `docs/design/` is the current reference; then:

- `## Current work` — the branch in flight and what it covers
- `## Next work` — agreed order, starting with the opencode gap audit
- `## Debt` — one paragraph and a link to `docs/technical-debt.md`, no list

- [ ] **Step 4: Generate, verify, commit**

```bash
npm run docs:toc && npm test && npm run typecheck
```

Commit as `docs: add the design overview`.

---

### Task 11: Standardise the remaining documents

**Files:** `README.md`, `AGENTS.md`, `docs/AGENTS.md`, the fourteen distributed
`AGENTS.md`, and the loose files in `docs/`.

- [ ] **Step 1: Point the entry documents at the reference**

Add one line to `README.md` linking `docs/design/` as the technical reference.
Add one line to root `AGENTS.md` doing the same. Rewrite `docs/AGENTS.md` (16
lines) to say what each subdirectory holds and which is authoritative.

- [ ] **Step 2: Check the fourteen distributed AGENTS.md against their directories**

For each, list the files it names and confirm they still exist and still do what
it says. Fix drift in place. Do not restructure.

```bash
for f in $(find src tests -name AGENTS.md); do echo "=== $f"; done
```

- [ ] **Step 3: Triage the loose docs**

`bs-coding-migration.md`, `katalon-setup.md`, `chatgpt-web-smoke-test.md`,
`provider-assignment-recovery.md`, `remote-control.md`. For each: confirm it is
current, then either link it from the matching design document or add a line at
its top marking it superseded and naming what replaced it.

- [ ] **Step 4: Correct stale product naming**

Five files mention the former "meow" name:

```bash
grep -rl "meow\|Meow" docs --include=*.md
```

Correct any that present it as current. Leave historical references — a plan from
2026-08-04 describing "meow" is accurate about its own moment.

- [ ] **Step 5: Full verification and commit**

```bash
npm run docs:toc && npm test && npm run typecheck && git status --porcelain
```

Expected: tests pass, and `docs:toc` produces no diff.

Commit as `docs: standardise the non-archive documentation`.

---

### Task 12: Verify the reference against the code

**Files:** none modified unless a correction is needed.

- [ ] **Step 1: Read `03-providers.md` against the v1.1.4 provider source**

This is the domain the session knows best, so it is the honest test of whether
the format carries real understanding. Confirm each Design decision matches what
the code does. Fix any that does not.

- [ ] **Step 2: Confirm the guards actually bite**

Temporarily add a heading to a design file without regenerating, run the suite,
confirm the TOC guard fails, then revert. Do the same with a cited path that does
not exist. A guard never seen failing is not known to work.

- [ ] **Step 3: Report and stop**

Do not merge or push. Report all twelve tasks and wait for the final approval
gate.
