# Project rules in one place, and the two steering documents — design

Date: 2026-08-27
Branch: `docs/project-rules-and-steering`
Supersedes: the `Current work` / `Next work` / `Debt` sections of
`docs/v1/design/README.md`, frozen with V1.

## The owner's principle

> Luật dự án vẫn sử dụng từ đầu cho đến khi tôi yêu cầu thay đổi, nó ko phải là
> tài liệu của V1 hay V2 hay bất kỳ version nào về sau.
>
> Luật dự án phải được đặt ở 1 vị trí duy nhất, tiếp cận đầu tiên chứ ko phải
> rải rác để rồi ko biết, đoán sai, đoán đại dẫn đến làm sai rồi lại xin lỗi.

Two rules follow, and everything below serves them:

1. **Project rules are not version-scoped.** They hold from the start of the
   project until the owner asks for a change. They do not live in `docs/v1/` or
   `docs/v2/`.
2. **Project rules live in exactly one place, and that place is read first.**

## Why scattered rules fail here, mechanically

This is not a preference. `loadInstructions(cwd)` in
`src/main/agent/instructions.ts` walks up from the working directory to the git
root when a session opens. At the repository root it loads exactly one file:
`AGENTS.md`.

The fourteen nested `AGENTS.md` files under `src/` and `tests/` are loaded by a
different function, `instructionFilesForFile`, which runs only *after* the model
has read a file in that folder. A rule in a nested file therefore arrives after
the decision it was supposed to govern. That is the sequence the owner
described: not knowing, guessing, getting it wrong.

Every one of those fourteen files carries a `Quy ước` / `Conventions` block.
That is where the project's rules are today.

## The three project-level documents

| File | Answers | How it is guaranteed to be read |
|---|---|---|
| `AGENTS.md` (repo root) | **The rules.** In force until the owner changes them. | Loaded automatically at session start by mechanism, not convention |
| `docs/CURRENT-WORK.md` | What is being worked on, what is next, what is blocked | `AGENTS.md` requires reading it before starting work |
| `docs/DEBT.md` | What was deliberately not done, why, and what closing it takes | `AGENTS.md` requires an entry whenever work is deliberately declined |

None of the three is version-scoped. `docs/v1/` is the past, `docs/v2/` is the
target, these three are the present.

---

## 1. `AGENTS.md` — the single location for rules

### Restructure

`Luật dự án` becomes the **first** section. Everything in the file that is
reference rather than rule — Công nghệ, Cấu trúc, Lệnh, Cài đặt trên Windows,
Docs — moves below it. Today the rules sit in the middle of the file under
`Quy ước`, between the command list and the test checklist.

The file stays in Vietnamese, matching what is there now.

### Rule inventory, and where each rule comes from

Every rule below either exists in the repository today or was stated by the
owner. Nothing here is invented for this document.

**A. Quy trình** — from the owner. None of these is written in the repo today.

- brainstorm → spec → plan → thực thi → review → merge → release, một gate duyệt
  ở mỗi bước. Restores the `Workflow:` line deleted from `AGENTS.md` by commit
  `0c327ff`, and matches `docs/v1/AGENTS.md`.
- "Thực hiện" chỉ mở đúng gate kế tiếp, không mở các bước sau.
- Mỗi task một nhánh riêng; không commit thẳng vào `master`.
- Đọc spec của vùng và `git log` của file trước khi sửa nó.
- Chỉ sửa đúng thứ được yêu cầu; thứ khác cần hỏi trước.
- Điều tra đủ rồi hỏi gộp một lượt, không hỏi rải rác.
- Tên file lưu trữ quy trình: `YYYY-MM-DD-slug.md`. From `docs/v1/AGENTS.md`.
- Cập nhật `docs/CURRENT-WORK.md`; ghi `docs/DEBT.md` khi quyết định không làm.

**B. Ranh giới tiến trình** — from `src/main/AGENTS.md`, `src/preload/AGENTS.md`,
`src/renderer/AGENTS.md`, `src/renderer/src/components/AGENTS.md`,
`src/shared/AGENTS.md`, `src/main/agent/AGENTS.md`,
`src/main/agent/lsp/AGENTS.md`, `src/main/agent/mcp/AGENTS.md`,
`src/main/agent/tools/AGENTS.md`.

- Chỉ main process được spawn/kill process.
- Renderer không import `electron` hay `node:*`; mọi truy cập qua `window.api`.
- Preload không expose `ipcRenderer`; chỉ đúng tập method trong `AgentApi`, và
  không import thư viện Node ngoài `electron`.
- `src/shared` chỉ chứa thứ JSON-serializable: không class, không function,
  không import Node/Electron, không kéo dependency ngoài.
- Service thuần không import Electron UI, để test được bằng Vitest.
- LSP và MCP chỉ chạy ở main; renderer không nói chuyện trực tiếp với chúng.
- Toàn bộ logic agent ở main; renderer chỉ thấy `ChatEvent` qua IPC.

**C. Hợp đồng IPC** — from `src/shared/AGENTS.md`, `src/main/AGENTS.md`,
`src/preload/AGENTS.md`, and the existing root `Quy ước`.

- Không hardcode channel string; chỉ dùng `Channels` trong `src/shared/ipc.ts`.
- Đổi contract phải cập nhật đồng bộ bốn chỗ: handler main, preload, renderer
  (`window.api`), và `tests/unit/ipc-contract.test.ts`.
- Thêm event push: channel `Event*` + interface payload + method subscribe trong
  `AgentApi`, rồi triển khai preload và forward ở main.
- Trạng thái agent chỉ đổi qua `MainApp.setState`; renderer chỉ được notify khi
  field hiển thị được đổi.

**D. Bẫy nền tảng** — from `src/main/AGENTS.md`,
`src/main/agent/tools/AGENTS.md`, the root `Cài đặt trên Windows` section, and
the owner.

- `buildSpawnCommand` bọc lệnh non-`.exe` qua `cmd.exe` trên Windows (ConPTY
  không spawn được `.cmd` shim). Không phá logic này.
- Tool `bash` ưu tiên Git Bash, fallback `cmd.exe`. Không phá logic này.
- Mọi path stop đi qua `tree-kill`; không để process mồ côi.
- node-pty dùng prebuilds; không sửa code node-pty. Thiếu binding thì
  `npx @electron/rebuild -f -w @lydell/node-pty`.
- Working tree là CRLF. `sed -i` âm thầm chuyển file sang LF, và `cat -A` / `awk`
  báo thiếu. Dùng công cụ sửa file thay vì `sed -i`.
- `npm run dev` cần port 1305 trống trước khi chạy; không cắt log dev.

**E. Kiểm thử** — from `tests/AGENTS.md`, `tests/unit/AGENTS.md`,
`tests/e2e/AGENTS.md`, `src/main/agent/AGENTS.md`, and the existing root
checklist.

- **Không bao giờ** gọi API LLM thật trong test; dùng stub `LlmClient`.
- Unit và integration không phụ thuộc agent thật; dùng fixture.
- Integration spawn PTY thật phải cleanup trong `afterEach`/`finally`.
- E2E cần `npm run build` trước.
- Sau khi đụng IPC hoặc UI, thêm hoặc mở rộng một assertion trong e2e smoke.
- Trước khi hoàn thành: `npm run typecheck` pass, `npm test` pass, và
  `npm run build && npm run e2e` nếu thay đổi chạm tới e2e.

**F. Thêm thứ mới** — from `src/main/agent/tools/AGENTS.md`,
`src/renderer/src/components/settings/AGENTS.md`.

- Thêm tool: implement trong `tools/`, đăng ký trong `tools/registry.ts`, thêm
  permission mặc định vào `DEFAULT_BS_CONFIG.permission` trong `config.ts`.
- Thêm setting: `src/shared/types.ts` + normalize trong `src/main/agent/config.ts`
  + tab tương ứng trong settings dialog.

**G. Hiệu năng renderer** — moved whole from `src/renderer/AGENTS.md`, including
its measurements. This block is the most expensive knowledge in the repository
and it currently sits where it is read only after the renderer has been edited.

- List dài bắt buộc có `content-visibility: auto` + `contain-intrinsic-size` trên
  từng row. Đo được: 39ms → 5.7ms mỗi keystroke.
- Ô chat input dùng uncontrolled (ref), không controlled + `setState`.
- Hạn chế animation trên phần tử cập nhật dày; scroll tức thời cho cập nhật lặp.
- Callback truyền xuống component `memo()` phải ổn định qua `useCallback`.
- Đừng tối ưu khi chưa đo. `requestAnimationFrame` không miễn phí.

**H. Ngôn ngữ và style** — from the existing root `Quy ước`,
`src/renderer/AGENTS.md`, `src/renderer/src/components/AGENTS.md`.

- Mã nguồn và UI label tiếng Anh; thông báo system-style từ main tiếng Việt,
  prefix `[bs]`.
- Không thêm comment thừa; chỉ comment khi giải thích quyết định phức tạp.
- Component functional + hooks; interface `Props` khai báo cùng file.
- Số liệu hiển thị dùng tabular-nums.

**I. Bảo mật** — from the existing root `Quy ước`, `src/main/AGENTS.md`.

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`.
- Browser bridge chỉ bind `127.0.0.1`; pairing code bắt buộc; chạy trên profile
  Chrome thật của user.
- Secret nằm trong vault (`safeStorage`), không lộ ra renderer, log hay fixture.

**J. Release** — from the owner and `docs/v1/changelog-format.md`.

- Viết `docs/release-notes/<tag>.md`, push tag, để CI publish. Không chạy
  `gh release create` bằng tay.

**K. Cách làm việc** — from the owner.

- Không spawn subagent; làm inline.
- Dùng superpowers skills cho phần việc chúng bao phủ.

### When a rule's mechanism changes

Several rules in B, C and F name V1 mechanisms that V2 replaces: `Channels`
becomes typed IPC at plan 14, `userData/*.json` becomes SQLite at plan 3. The
rule is not version-scoped; the mechanism it names is. When a V2 plan replaces a
mechanism, the rule is rewritten in the same change, and that rewrite needs the
owner's approval like any other rule change. A rule is never silently dropped
because the code moved.

### The fourteen nested `AGENTS.md` files

Each keeps its `Key files` table — a map of the folder, descriptive, useful in
place, and harmless when stale in a way a rule is not. Each loses its `Quy ước` /
`Conventions` block to the root file, and gains a first line:

> Luật dự án ở `/AGENTS.md`. File này chỉ mô tả thư mục này, không đặt luật.

`src/preload/AGENTS.md` is rules only, with no file map. It is deleted.

---

## 2. `docs/CURRENT-WORK.md`

English. Structure:

| Section | Rule |
|---|---|
| `Now` | **Exactly one** entry: what, branch, gate (what must be true to close it), what is left, links to its spec and plan |
| `Next` | Ordered queue of **decided** work, one to three lines each plus its prerequisite. Not an idea backlog |
| `Blocked` | Work started then stopped: what it waits on, and who owns the answer |
| `Standing rules` | Constraints that will expire, so they do not belong in `AGENTS.md` |
| `Where the detail lives` | Table pointing down to `implementation-progress.md`, `acceptance-matrix.md`, `START_HERE.md`, `DEBT.md`, release notes |

The one-entry limit on `Now` is what makes the file worth reading: it forces the
truth when two things are running at once.

It does **not** carry technical detail, which belongs in a spec or plan, and does
**not** carry finished history, which belongs in git log and the changelogs. It
does **not** summarise `DEBT.md`. That last rule is inherited verbatim from the
`Debt` section of `docs/v1/design/README.md`: two copies of a list diverge, a
failure this codebase already paid for once with duplicated quota state.

### Seed content

`Now` is the V2 P01 foundation plan on branch `v2/p01-foundation`: the approved
Figma Make prototype is vendored, P01 itself is not started, and the gate is
`npm run typecheck` plus the three P01 unit tests. `Next` is P02 through P04 in
master-plan order. `Standing rules` records that V2 is built beside V1 until the
plan 20 cutover.

---

## 3. `docs/DEBT.md`

English. The format is inherited from `docs/v1/technical-debt.md`, which is
already right: **Found** (the date and what was being done when it surfaced), a
body explaining why it was set aside on purpose, and **To close** (what closing
it takes). An index table heads the file.

One column is added: **Track** — `V1-maint` (the shipped app, until cutover),
`V2` (the rebuild), `Cross` (both).

### Numbering

Original numbers are kept, gaps and all: 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 14, 16.
New entries start at 17.

Renumbering was considered and rejected on evidence. Entries cite each other, and
the V1 file already carries two stale citations from an earlier renumber: item 8
says *"citing debt item 7 (opencode feature gaps)"* when opencode gaps is item 6,
and item 10 says *"This is not item 8"* when the `ERR_IPC_CHANNEL_CLOSED` entry
is item 7. Both are corrected during the move, since both have now been checked
against the entries themselves.

### Triage of the sixteen V1 entries

The test applied: **move it if closing it is still a decision this project will
make.** Twelve move, four stay.

| # | Item | Decision | Track |
|---|---|---|---|
| 1 | No designed quota-health signal for routing | move | Cross |
| 2 | Only two providers report usage | move | Cross |
| 3 | Antigravity reports no subscription term | move | Cross — won't fix, must survive so V2 does not re-investigate |
| 4 | Google OAuth client secret is public | move | Cross — accepted, ships in every installer today |
| 5 | Tray artwork is not platform-specific | move | Cross — the Electron shell survives cutover |
| 6 | opencode feature gaps | stay | closed |
| 7 | The test runner crashes intermittently | move | Cross — shared test infrastructure, gates V2 plans |
| 8 | No guard checks whether a design sentence is true | move | Cross — applies directly to the 1583-line V2 prose pack |
| 9 | The balance quota model is unparsed | move | Cross |
| 10 | A process-killing test times out under load | move | Cross |
| 11 | A coordinator can spend every worker's quota | move | Cross — the V2 Orchestrator must decide it |
| 12 | Agent bindings live in app settings | stay | the Settings screen is replaced wholesale at plan 15 |
| 13 | Fleet shows no session tokens or cost | stay | the fleet surface is replaced wholesale |
| 14 | subagentModels overlaps agents and modes | move | Cross — the V2 domain model forces the decision |
| 15 | Sessions cannot be reordered by hand | stay | the sidebar and session UI are replaced wholesale |
| 16 | This release's UI was not confirmed in the app | move | V1-maint — still open today |

A `Superseded` section records that 12, 13 and 15 are V1 renderer debt the
rebuild deletes rather than fixes, with a pointer to
`docs/v1/technical-debt.md`. If the V2 UI reintroduces the same split, a fresh
entry is opened here.

### One new entry, #17

Commit `0c327ff` deleted `tests/unit/design-docs.test.ts`,
`scripts/build-docs-toc.mjs` and the `docs:toc` script — the only mechanical
guard that a table of contents matched its content and that every cited path
existed. It was deleted in the same commit that took in `docs/v2/`: thirty-four
architecture documents with `depends_on` fields, a `MANIFEST.txt`, twenty plans
and relative links throughout, none of it checked by anything.

This is entry 8 one notch worse. Before, the mechanical part was verified and
only the prose was not. Now neither is.

---

## 4. Where process documents live from now on

The spec, plan, brainstorm, note and audit archive is not version-scoped either;
it records how the project reached a decision. `docs/v1/superpowers/` is frozen
with V1, so the archive is re-established at its original location,
`docs/superpowers/`, starting with this spec. `AGENTS.md` names it, so nobody has
to infer it from where old files happen to sit.

## 5. Deletions

- `docs/v1/AGENTS.md`. It is an instruction file, not a historical record, and it
  is wrong: it calls `design/` the trustworthy account of the present, and tells
  the reader to run `npm run docs:toc` to satisfy a test — the script, the npm
  script and the test were all deleted by the commit that moved this file into
  `docs/v1/`. Its still-true content (the `YYYY-MM-DD-slug` naming rule and the
  brainstorm → spec → plan workflow) is pulled up into `AGENTS.md` first.
- `src/preload/AGENTS.md`, which is rules only.

## 6. What this does not do

- It does not touch `docs/v2/`. That pack is placed whole, and its internal
  links and `depends_on` fields are relative to it.
- It does not close any debt entry. Moving an entry is not paying it.
- It does not create `docs/v2/implementation-progress.md`. The master plan makes
  that P01's job.
- It does not add a mechanical guard for documentation links. That is debt entry
  17, recorded rather than fixed.

## 7. Verification

- `npm run typecheck` and `npm test` pass. Neither should be affected: the only
  test that reads `docs/` is `tests/unit/release-notes.test.ts`, which checks
  `docs/release-notes/v<version>.md` and is untouched.
- Every path cited by the three documents exists. Checked by hand, because entry
  17 records that the guard which used to do this is gone.
- No rule present in the repository before this change is absent after it. The
  inventory in section 1 is the checklist.
