# Project Rules and Steering Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project forbids spawning subagents, so subagent-driven-development does not apply here.

**Goal:** Put every project rule in the one file that is loaded first, and add the two steering documents that say what is being worked on and what was deliberately not done.

**Architecture:** `AGENTS.md` at the repository root becomes the single location for rules, because `loadInstructions` in `src/main/agent/instructions.ts` loads it and nothing else at session start. The fourteen nested `AGENTS.md` files keep their file maps and lose their rule blocks. `docs/CURRENT-WORK.md` and `docs/DEBT.md` join it as project-level documents that belong to no version.

**Tech Stack:** Markdown only. No source file changes. Verification via `npm run typecheck`, `npm test`, and a one-off Node link check that is not committed.

**Spec:** `../specs/2026-08-27-project-rules-and-steering-docs-design.md`

## Global Constraints

- Nothing under `docs/v2/` is edited, moved, or renamed. Its internal links, `depends_on` fields and `MANIFEST.txt` are relative to it.
- No rule that exists in the repository before this change may be absent after it. Section 1 of the spec is the inventory to check against.
- Rules stay in Vietnamese, matching `AGENTS.md` today. `docs/CURRENT-WORK.md` and `docs/DEBT.md` are English.
- Debt entries keep their original numbers, gaps included: 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 14, 16. New entries start at 17.
- Moving a debt entry is not paying it. No entry is closed by this plan.
- No mechanical documentation guard is added. That is debt entry 17, recorded rather than fixed.
- Do not use `sed -i` on any file in this repository. The working tree is CRLF and `sed -i` silently rewrites the file to LF.
- Tasks are committed one at a time, in order, on branch `docs/project-rules-and-steering`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `docs/DEBT.md` | The live debt ledger, all tracks | 1 |
| `docs/CURRENT-WORK.md` | Now / Next / Blocked / Standing rules | 2 |
| `AGENTS.md` | Every project rule, first section | 3 |
| 13 nested `AGENTS.md` | Folder maps only, no rules | 4 |
| `src/preload/AGENTS.md` | deleted — rules only, no map | 4 |
| `docs/v1/AGENTS.md` | deleted — wrong, and rules belong at root | 4 |

Tasks 1 and 2 run before task 3 so that every path `AGENTS.md` cites already exists when it is written.

---

### Task 1: Create `docs/DEBT.md`

**Files:**
- Create: `docs/DEBT.md`
- Read: `docs/v1/technical-debt.md` (source; not modified by this task)

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/DEBT.md` with entries numbered 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 14, 16, 17; a `Superseded` section; and an index table whose columns are `#`, `Item`, `Area`, `Track`, `Severity`. Tasks 2 and 3 link to this path.

- [ ] **Step 1: Write the file header and the rules of the ledger**

```markdown
# Debt

Work deliberately deferred, with the reason it was deferred and what it would
take to close. Each entry was raised while doing something else and set aside on
purpose — none of it is a forgotten TODO.

Add an entry when you decide *not* to do something you found. Remove it when the
work lands, naming the commit.

This ledger belongs to the project, not to a version. **Track** says which line
of work has to close an entry: `V1-maint` is the shipped app up to the plan 20
cutover, `V2` is the rebuild, `Cross` is both.

Last reviewed: 2026-08-27
```

- [ ] **Step 2: Write the index table**

Twelve migrated rows plus entry 17. `Area` and `Severity` are copied from the index of `docs/v1/technical-debt.md` lines 16-31; `Track` comes from the triage table in spec section 3.

```markdown
## Index

| # | Item | Area | Track | Severity |
|---|---|---|---|---|
| 1 | [No designed quota-health signal for routing](#1-no-designed-quota-health-signal-for-routing) | Providers | Cross | Medium |
| 2 | [Only two providers report usage](#2-only-two-providers-report-usage) | Providers | Cross | Medium |
| 3 | [Antigravity reports no subscription term](#3-antigravity-reports-no-subscription-term) | Providers | Cross | Won't fix |
| 4 | [Google OAuth client secret is public](#4-google-oauth-client-secret-is-public) | Security | Cross | Accepted |
| 5 | [Tray artwork is not platform-specific](#5-tray-artwork-is-not-platform-specific) | Desktop | Cross | Low |
| 7 | [The test runner crashes intermittently](#7-the-test-runner-crashes-intermittently) | Build | Cross | Medium |
| 8 | [No guard checks whether a design sentence is true](#8-no-guard-checks-whether-a-design-sentence-is-true) | Docs | Cross | Medium |
| 9 | [The balance quota model is unparsed](#9-the-balance-quota-model-is-unparsed) | Providers | Cross | Medium |
| 10 | [A process-killing test times out under full-suite load](#10-a-process-killing-test-times-out-under-full-suite-load) | Build | Cross | Low |
| 11 | [A coordinator can spend every worker's quota](#11-a-coordinator-can-spend-every-workers-quota) | Agent | Cross | Low |
| 14 | [subagentModels overlaps agents and modes](#14-subagentmodels-overlaps-agents-and-modes) | Product | Cross | Medium |
| 16 | [This release's UI was not confirmed in the app](#16-this-releases-ui-was-not-confirmed-in-the-app) | Process | V1-maint | Medium |
| 17 | [Nothing checks a documentation link any more](#17-nothing-checks-a-documentation-link-any-more) | Docs | Cross | Medium |
```

- [ ] **Step 3: Write the Superseded section**

```markdown
## Superseded

Three V1 renderer entries are not carried over, because the V2 rebuild deletes
the surfaces they describe rather than fixing them: agent bindings living in app
settings, the fleet panel showing no session tokens or cost, and sessions not
being reorderable by hand. They stay recorded as items 12, 13 and 15 of
`docs/v1/technical-debt.md`. If the V2 UI reintroduces one of those splits, open
a fresh entry here rather than reviving that one.

Item 6 of that file is closed and stays there too. It is kept for its lesson —
re-measure before planning from any summary — not as outstanding work.
```

- [ ] **Step 4: Copy the twelve entries verbatim**

Copy each body from `docs/v1/technical-debt.md` at the line ranges below, in this order, separated by the `---` and blank-line rhythm the source uses. Headings keep their original numbers and titles.

| Entry | Source lines |
|---|---|
| 1 | 35-57 |
| 2 | 59-79 |
| 3 | 81-99 |
| 4 | 101-127 |
| 5 | 129-147 |
| 7 | 182-205 |
| 8 | 207-257 |
| 9 | 259-282 |
| 10 | 284-307 |
| 11 | 309-326 |
| 14 | 373-389 |
| 16 | 406-422 |

Change nothing except the three stale citations in step 5.

- [ ] **Step 5: Correct the three stale cross-references**

`docs/v1/technical-debt.md` carries three citations left over from an earlier renumbering. All three have been checked against the entries themselves. In the copy in `docs/DEBT.md`:

- Source line 219, inside entry 8, reads `by citing debt item 7 (opencode feature gaps) rather than`. The opencode entry is 6, and it does not move to this file. Replace with:
  `by citing V1 debt item 6 (opencode feature gaps, in`
  `` `docs/v1/technical-debt.md`) rather than ``
- Source line 294, inside entry 10, reads `This is **not** item 8.` The `ERR_IPC_CHANNEL_CLOSED` entry is 7. Replace `item 8` with `item 7`.
- Source line 298, inside entry 10, reads `Same reason as item 8:`. Same off-by-one. Replace `item 8` with `item 7`.

- [ ] **Step 6: Write entry 17**

```markdown
## 17. Nothing checks a documentation link any more

**Found:** 2026-08-27, while consolidating the project rules.

`tests/unit/design-docs.test.ts`, `scripts/build-docs-toc.mjs` and the
`docs:toc` npm script were deleted by commit `0c327ff`. Between them they were
the only mechanical guard in the repository that a table of contents matched its
content and that every path a document cited existed.

They were deleted in the same commit that took in `docs/v2/`: 34 architecture
documents carrying `depends_on` fields, a `MANIFEST.txt`, twenty implementation
plans, and relative links throughout. None of it is checked by anything.

**Why it matters.** This is item 8 one notch worse. Item 8 records that no guard
can tell whether a design sentence is *true*; the mechanical half — does this
path exist, does this index match — was at least verified, which is what made
the prose feel trustworthy by association. Now neither half is.

**To close:** decide what the guard covers before writing one. The retired test
encoded V1 conventions that `docs/v2/` does not follow, so restoring it verbatim
would fail on a pack that is correct. A link-existence check across all of
`docs/` is the smaller, honest starting point.
```

- [ ] **Step 7: Verify every entry arrived and the anchors resolve**

Run:

```bash
grep -cE '^## [0-9]+\.' docs/DEBT.md
```

Expected: `13` — twelve migrated entries plus entry 17.

Run:

```bash
grep -oE '^\| [0-9]+ ' docs/DEBT.md | tr -d '| ' | tr '\n' ' '
```

Expected: `1 2 3 4 5 7 8 9 10 11 14 16 17`

- [ ] **Step 8: Verify no stale citation survived**

Run:

```bash
grep -n "item 8" docs/DEBT.md
```

Expected: no line inside entry 10. The only permitted match is inside entry 17, where "item 8" refers to entry 8 correctly.

- [ ] **Step 9: Commit**

```bash
git add docs/DEBT.md
git commit -m "docs: open the project debt ledger"
```

---

### Task 2: Create `docs/CURRENT-WORK.md`

**Files:**
- Create: `docs/CURRENT-WORK.md`

**Interfaces:**
- Consumes: `docs/DEBT.md` from task 1, which it links to and must not summarise.
- Produces: `docs/CURRENT-WORK.md` with sections `Now`, `Next`, `Blocked`, `Standing rules`, `Where the detail lives`. Task 3 links to this path.

- [ ] **Step 1: Write the file with its seed content**

`docs/v2/implementation-progress.md` and `docs/v2/acceptance-matrix.md` do not exist yet — the master plan makes them P01's and the release's job. They are named in prose with that stated, not linked, so the link check in task 5 stays honest.

```markdown
# Current work

The highest-level statement of what this project is doing. Read it before
starting anything. If you are asked to do something this file does not describe,
update it before you start.

It belongs to no version. `docs/v1/` is the past and `docs/v2/` is the target;
this is the present. V1.3.2 is the shipped product and V2.0.0 is being built
beside it, so both appear here.

Last updated: 2026-08-27

## Now

Exactly one entry. If two things are genuinely running, that is what this file
exists to say out loud.

**V2 plan 01 — foundation and module boundaries.**

- **Branch:** `v2/p01-foundation`
- **Gate:** `npm run typecheck` passes and the three P01 unit tests are green
- **Landed so far:** the approved Figma Make prototype is vendored at
  `docs/v2/prototype/`. P01 itself has not started.
- **Left to do:** the V2 directory and barrel skeleton; the common primitives
  `EntityId`, `IsoDateTime`, `CommandResult<T>`, `Clock` and `IdGenerator`; the
  `createV2Runtime` bootstrap gate and its seam in `src/main/index.ts`. Record
  the completion commit in `docs/v2/implementation-progress.md`, which P01
  creates.
- **Plan:** [`v2/implementation-plans/plans/01-foundation-module-boundaries.md`](v2/implementation-plans/plans/01-foundation-module-boundaries.md)

## Next

Decided work, in order. Not an idea backlog — something reaches this list only
after it has been decided.

| # | Work | Prerequisite |
|---|---|---|
| 1 | V2 plan 02 — domain model and state machines | P01 gate green and reviewed |
| 2 | V2 plan 03 — SQLite persistence and event store | P02. Needs a SQLite dependency chosen; the repo has none today |
| 3 | V2 plan 04 — canonical event protocol | P03 |

## Blocked

Nothing.

## Standing rules

Constraints that will expire, so they are not in `AGENTS.md`.

- V2 is built beside V1 under `src/main/v2`, `src/shared/v2` and
  `src/renderer/src/v2` until the plan 20 cutover. `BsAgentManager` never
  becomes a V2 dependency.
- The V2 documentation pack is placed whole. Nothing under `docs/v2/` is edited,
  moved or renamed.

## Where the detail lives

This file does not repeat any of it. In particular it does not summarise the
debt ledger: two copies of a list diverge, which this codebase has already paid
for once with duplicated quota state.

| Question | Where |
|---|---|
| What are the project's rules | [`/AGENTS.md`](../AGENTS.md) |
| What was deliberately not done | [`DEBT.md`](DEBT.md) |
| What is the V2 target | [`v2/START_HERE.md`](v2/START_HERE.md) |
| Which V2 plan landed, at which commit | `docs/v2/implementation-progress.md`, created by P01 |
| Which acceptance criteria are met | `docs/v2/acceptance-matrix.md`, required before release by the master plan |
| How the project reached a decision | [`superpowers/specs/`](superpowers/specs/) and [`superpowers/plans/`](superpowers/plans/) |
| What shipped in each release | [`release-notes/`](release-notes/) and `docs/v1/changelog-*.md` |
```

- [ ] **Step 2: Verify the one-entry rule holds and the debt list is not duplicated**

Run:

```bash
grep -c '^\*\*V2 plan' docs/CURRENT-WORK.md
```

Expected: `1`.

Read the `Where the detail lives` section and confirm no debt item title appears anywhere in the file.

- [ ] **Step 3: Commit**

```bash
git add docs/CURRENT-WORK.md
git commit -m "docs: state the current work at project level"
```

---

### Task 3: Restructure `AGENTS.md` into the single location for rules

**Files:**
- Modify: `AGENTS.md` (77 lines today)

**Interfaces:**
- Consumes: `docs/CURRENT-WORK.md` and `docs/DEBT.md` from tasks 1 and 2.
- Produces: `AGENTS.md` whose first section is `Luật dự án`, holding groups A through K. Task 4 removes from the nested files only rules that are present here.

- [ ] **Step 1: Keep the opening description, then insert `## Luật dự án` as the first section**

`AGENTS.md` lines 1-5 (the title and the two-line product description) stay at the top. `## Luật dự án` goes immediately after, before `## Công nghệ`. Everything currently at lines 6-77 keeps its text and moves below the new section, minus the parts folded into it by steps 2-4.

- [ ] **Step 2: Write the rule groups that exist nowhere in the repository**

These are the owner's rules. They have no source file to copy from, so they are written out here in full.

```markdown
### A. Quy trình

- Quy trình: brainstorm → spec → plan → thực thi → review → merge → release. Mỗi
  bước là một gate, phải được duyệt trước khi sang bước sau.
- "Thực hiện" chỉ mở đúng gate kế tiếp. Không tự quyết định gộp bước, hoãn việc
  hay bỏ việc.
- Mỗi task một nhánh riêng. Không commit thẳng vào `master`.
- Đọc spec của vùng và `git log` của file trước khi sửa nó.
- Chỉ sửa đúng thứ được yêu cầu. Thứ khác mà thay đổi chạm tới cần hỏi trước.
- Điều tra đủ rồi hỏi gộp một lượt, không hỏi rải rác từng câu.
- Cập nhật `docs/CURRENT-WORK.md` khi trạng thái công việc đổi. Khi quyết định
  KHÔNG làm một việc vừa phát hiện, ghi vào `docs/DEBT.md` — không ghi thì nó
  thành TODO bị quên.
- Tên file lưu trữ quy trình: `YYYY-MM-DD-slug.md`, đặt trong
  `docs/superpowers/specs/`, `docs/superpowers/plans/`.

### J. Release

- Viết `docs/release-notes/<tag>.md` rồi push tag, để CI publish. Không chạy
  `gh release create` bằng tay.
- Format changelog: `docs/v1/changelog-format.md`.

### K. Cách làm việc

- Không spawn subagent; làm inline.
- Dùng superpowers skills cho phần việc chúng bao phủ.
```

The following three bullets belong to group D and also exist nowhere in the repo. They are added to that group alongside the ones moved from source files in step 3.

```markdown
- Working tree là CRLF. `sed -i` âm thầm chuyển cả file sang LF, và `cat -A` /
  `awk` báo thiếu nên không phát hiện ra. Dùng công cụ sửa file thay vì `sed -i`.
- `npm run dev` cần port 1305 trống trước khi chạy.
- Không cắt ngắn log dev khi đọc.
```

- [ ] **Step 3: Move the rule blocks out of the nested files into groups B through I**

Each line below is a source range to copy from. Do not paraphrase — move the sentence as written, keeping every symbol name, file path and measured number intact.

Nine of the source files are written in English (`src/main/agent/AGENTS.md` and its `lsp/`, `mcp/`, `tools/` children, `src/renderer/src/components/AGENTS.md` and its `chat/`, `settings/` children, `tests/e2e/AGENTS.md`, `tests/unit/AGENTS.md`). `AGENTS.md` is Vietnamese throughout, so bullets from those files are translated into Vietnamese as they move. Translate the prose only; leave code spans, paths and numbers exactly as they are.

The full inventory with the reasoning is spec section 1.

| Group | Heading to write | Sources |
|---|---|---|
| B | `### B. Ranh giới tiến trình` | `src/main/AGENTS.md:37-48`, `src/preload/AGENTS.md:1-10`, `src/renderer/AGENTS.md:16-26`, `src/renderer/src/components/AGENTS.md:32-36`, `src/shared/AGENTS.md:21-28`, `src/main/agent/AGENTS.md:36-41`, `src/main/agent/lsp/AGENTS.md:14-18`, `src/main/agent/mcp/AGENTS.md:12-16` |
| C | `### C. Hợp đồng IPC` | `src/shared/AGENTS.md:21-28`, `src/main/AGENTS.md:37-48`, `src/preload/AGENTS.md:1-10`, existing `AGENTS.md:45-59` |
| D | `### D. Bẫy nền tảng` | `src/main/AGENTS.md:37-48`, `src/main/agent/tools/AGENTS.md:32-37`, existing `AGENTS.md:37-44`, plus the three bullets from step 2 |
| E | `### E. Kiểm thử` | `tests/AGENTS.md:9-17`, `tests/unit/AGENTS.md:7-14`, `tests/e2e/AGENTS.md:17-22`, `src/main/agent/AGENTS.md:36-41`, `src/renderer/AGENTS.md:58-61`, existing `AGENTS.md:60-65` |
| F | `### F. Thêm thứ mới` | `src/main/agent/tools/AGENTS.md:32-37`, `src/renderer/src/components/settings/AGENTS.md:26-30` |
| G | `### G. Hiệu năng renderer` | `src/renderer/AGENTS.md:27-57` — moved whole, measurements included |
| H | `### H. Ngôn ngữ và style` | existing `AGENTS.md:45-59`, `src/renderer/AGENTS.md:16-26`, `src/renderer/src/components/AGENTS.md:32-36`, `src/renderer/src/components/chat/AGENTS.md:25-30` |
| I | `### I. Bảo mật` | existing `AGENTS.md:45-59`, `src/main/AGENTS.md:37-48` |

A bullet cited by two groups goes in the group that owns it and is not repeated. Where a source range is cited twice above, it is because different bullets inside it belong to different groups.

- [ ] **Step 4: Rewrite the `## Docs` section**

The current section names `docs/v2/`, `docs/v1/`, `docs/release-notes/` and the side-by-side V2 layout. Keep those four bullets as they are and add the three project-level documents at the top of the list, so the first thing named is what to read first.

```markdown
## Docs

- `docs/CURRENT-WORK.md` — **đọc trước mọi việc.** Việc đang làm, việc sắp làm,
  việc đang bị chặn. Đây là thẩm quyền về "việc gì đang mở". Được giao việc mà
  file này không mô tả thì cập nhật nó trước khi bắt đầu.
- `docs/DEBT.md` — nợ dự án: thứ đã cố tình không làm, vì sao, và cần gì để
  đóng. Không thuộc version nào.
- `docs/superpowers/` — kho quy trình: `specs/`, `plans/`, `brainstorms/`,
  `notes/`, `audits/`. Mỗi file là ảnh chụp một quyết định tại một thời điểm.
```

- [ ] **Step 5: Verify the rules section is first and the file still names everything it should**

Run:

```bash
grep -nE '^## ' AGENTS.md | head -3
```

Expected: `## Luật dự án` is the first `##` heading in the file.

Run:

```bash
grep -cE '^### [A-K]\. ' AGENTS.md
```

Expected: `11`.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md
git commit -m "docs: make AGENTS.md the single location for project rules"
```

---

### Task 4: Strip rules from the nested files, delete the two rules-only files

**Files:**
- Modify: `src/main/AGENTS.md`, `src/main/agent/AGENTS.md`, `src/main/agent/lsp/AGENTS.md`, `src/main/agent/mcp/AGENTS.md`, `src/main/agent/tools/AGENTS.md`, `src/renderer/AGENTS.md`, `src/renderer/src/components/AGENTS.md`, `src/renderer/src/components/chat/AGENTS.md`, `src/renderer/src/components/settings/AGENTS.md`, `src/shared/AGENTS.md`, `tests/AGENTS.md`, `tests/e2e/AGENTS.md`, `tests/unit/AGENTS.md`
- Delete: `src/preload/AGENTS.md`, `docs/v1/AGENTS.md`

**Interfaces:**
- Consumes: `AGENTS.md` from task 3. A block is removed here only if task 3 put its rules there.
- Produces: thirteen nested files that describe and do not legislate.

- [ ] **Step 1: Add the pointer line to each of the thirteen files**

Immediately under the `# AGENTS.md — <path>` title of every file listed under Modify:

```markdown
> Luật dự án ở [`/AGENTS.md`](/AGENTS.md). File này chỉ mô tả thư mục này, không đặt luật.
```

- [ ] **Step 2: Delete the rule blocks**

Delete these ranges. Line numbers are from the files as they stand before this task; work bottom-up within each file so earlier deletions do not shift later ones.

| File | Delete |
|---|---|
| `src/main/AGENTS.md` | 37-48 (`## Quy ước`), and line 57 only (`Chạy: npm run typecheck, npm test`). Keep 49-56, the test file map |
| `src/main/agent/AGENTS.md` | 36-41 (`## Conventions`) |
| `src/main/agent/lsp/AGENTS.md` | 14-18 (`## Conventions`) |
| `src/main/agent/mcp/AGENTS.md` | 12-16 (`## Conventions`) |
| `src/main/agent/tools/AGENTS.md` | 32-37 (`## Conventions`) |
| `src/renderer/AGENTS.md` | 16-61 (`## Quy ước`, `## Hiệu năng`, `## Kiểm thử`). Keep 1-15 |
| `src/renderer/src/components/AGENTS.md` | 32-36 (`## Conventions`) |
| `src/renderer/src/components/chat/AGENTS.md` | 25-30 (`## Conventions`) |
| `src/renderer/src/components/settings/AGENTS.md` | 26-30 (`## Conventions`) |
| `src/shared/AGENTS.md` | 21-28 (`## Quy ước`). Keep 1-20 |
| `tests/AGENTS.md` | 9-17 (`## Quy ước`). Keep 1-8 |
| `tests/e2e/AGENTS.md` | 17-22 (`## Conventions`) |
| `tests/unit/AGENTS.md` | 7-14 (`## Conventions`). Keep 1-6 |

- [ ] **Step 3: Delete the two rules-only files**

```bash
git rm src/preload/AGENTS.md docs/v1/AGENTS.md
```

`src/preload/AGENTS.md` is six rule bullets with no file map; its rules are in group B and C. `docs/v1/AGENTS.md` is an instruction file, not a record: it calls `design/` the trustworthy account of the present, and tells the reader to run `npm run docs:toc` to satisfy a test that commit `0c327ff` deleted along with the script. Its two still-true rules — the `YYYY-MM-DD-slug` naming and the brainstorm → spec → plan workflow — are in group A.

- [ ] **Step 4: Verify no rule block survives outside the root file**

Run:

```bash
grep -rn "^## Quy ước\|^## Conventions" --include=AGENTS.md . | grep -v "^./AGENTS.md"
```

Expected: no output.

Run:

```bash
find . -path ./node_modules -prune -o -name AGENTS.md -print | wc -l
```

Expected: `14` — the root file plus thirteen folder maps.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: leave the nested AGENTS.md files describing, not legislating"
```

---

### Task 5: Verification gate

**Files:**
- Create: `<scratchpad>/check-doc-links.mjs` in the session scratchpad directory, so it is never committed. A one-off check, deliberately not added to the repository. Adding a guard to the repository is debt entry 17, recorded rather than fixed.

**Interfaces:**
- Consumes: everything from tasks 1 through 4.
- Produces: evidence for the three claims in spec section 7.

- [ ] **Step 1: Confirm the source tree is untouched**

Run:

```bash
git diff --stat master...HEAD -- src/ tests/ scripts/ package.json
```

Expected: only `AGENTS.md` files listed. No `.ts`, `.tsx`, `.mjs` or `package.json` change.

- [ ] **Step 2: Run the project's own gate**

Run:

```bash
npm run typecheck && npm test
```

Expected: both pass. Neither reads the changed files. The only test that reads `docs/` is `tests/unit/release-notes.test.ts`, which checks `docs/release-notes/v<version>.md` and is untouched.

- [ ] **Step 3: Write the link check into the scratchpad**

```javascript
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const files = ['AGENTS.md', 'docs/CURRENT-WORK.md', 'docs/DEBT.md']
let bad = 0
for (const file of files) {
  const text = readFileSync(file, 'utf-8')
  const targets = new Set()
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) targets.add(m[1])
  for (const m of text.matchAll(/`([\w./@-]+\.(?:md|ts|tsx|mjs|json))`/g)) targets.add(m[1])
  for (const raw of targets) {
    if (raw.startsWith('http')) continue
    const target = raw.split('#')[0]
    if (!target) continue
    const rel = resolve(dirname(file), target.replace(/^\//, ''))
    const fromRoot = resolve(process.cwd(), target.replace(/^\//, ''))
    if (!existsSync(rel) && !existsSync(fromRoot)) {
      console.log(`${file} -> MISSING ${raw}`)
      bad++
    }
  }
}
console.log(bad === 0 ? 'all links resolve' : `${bad} missing`)
```

- [ ] **Step 4: Run the link check**

Run:

```bash
node <scratchpad>/check-doc-links.mjs
```

Expected: `all links resolve`. Two paths are named in prose rather than linked because they do not exist yet — `docs/v2/implementation-progress.md` and `docs/v2/acceptance-matrix.md` — and the check must not report them. If it does, the prose was written as a link by mistake.

- [ ] **Step 5: Confirm no rule was lost**

Run:

```bash
git diff master...HEAD -- '*AGENTS.md' | grep '^-' | grep -vE '^---' | grep -E '^-[-*] ' | sort > <scratchpad>/removed-rules.txt
wc -l < <scratchpad>/removed-rules.txt
```

Read every removed bullet against `AGENTS.md` and confirm each one is present in some group A through K, or is a duplicate of one that is. This is the checklist in spec section 7, and it is done by reading because entry 17 records that the guard which would have done it is gone.

- [ ] **Step 6: Update `docs/CURRENT-WORK.md` to describe what just happened**

The `Now` entry still describes V2 P01, which is correct: this documentation branch is finishing, and P01 is what remains open. Add one line under `Landed so far` in the `Now` entry noting that the project rules were consolidated on this date, and refresh `Last updated`.

- [ ] **Step 7: Commit**

```bash
git add docs/CURRENT-WORK.md
git commit -m "docs: record the rules consolidation in current work"
```

---

## Completion Gate

`npm run typecheck` and `npm test` green; the link check reports `all links resolve`; `find . -name AGENTS.md` outside `node_modules` returns 14 files; no `## Quy ước` or `## Conventions` heading exists outside the root `AGENTS.md`; every removed rule bullet accounted for in groups A through K.

## Acceptance / Traceability

- Spec section 1 — every rule in one file, loaded first by `loadInstructions`.
- Spec section 2 — `docs/CURRENT-WORK.md` exists with one `Now` entry and no debt summary.
- Spec section 3 — twelve entries migrated with original numbers, three stale citations corrected, entry 17 opened.
- Spec section 4 — the process archive is at `docs/superpowers/` and `AGENTS.md` names it.
- Spec section 5 — `docs/v1/AGENTS.md` and `src/preload/AGENTS.md` deleted.
- Spec section 6 — `docs/v2/` untouched; no debt closed; no documentation guard added.
