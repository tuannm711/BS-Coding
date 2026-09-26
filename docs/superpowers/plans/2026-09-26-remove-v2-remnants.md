# Remove V2 Remnants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (thực thi inline — luật dự án
> cấm subagent). Steps dùng checkbox (`- [ ]`).

**Goal:** BS Coding (repo, 3 nhánh remote, máy local, memory) không còn nội dung hay chỉ dẫn nào về V2
hoặc sản phẩm kế nhiệm; hành vi app không đổi.

**Architecture:** Sửa governance/comment trên `develop/v1` rồi đưa sang `release/v1`; viết lại governance
và xoá `docs/v2` trên `main`; dọn nhánh local, dữ liệu app sót lại và memory.

**Tech Stack:** git, Electron/Vitest (verify), GitHub Actions, PowerShell (Recycle Bin).

**Spec:** `docs/superpowers/specs/2026-09-26-remove-v2-remnants-design.md` (đã duyệt).

## Global Constraints

- Không nhắc V2, `develop/v2`, `release/v2` hay sản phẩm khác trong governance; tài liệu lịch sử
  (`docs/reports/*`, plan/spec 1.3.3–1.3.4, note fleet) giữ nguyên.
- Hành vi updater giữ nguyên (lọc cùng major). Không tag, không release.
- Làm trong worktree `.claude/worktrees/bs-coding-v1-3-3-release-d5127b`; không sửa checkout chính.
- `release/v1` phải giữ `on: push: tags: ['v1.*']` sau mọi merge.
- Working tree CRLF: sửa bằng Edit/Write hoặc Node đọc/ghi chuỗi, không `sed -i`.
- Dữ liệu người dùng chỉ được chuyển vào Recycle Bin, không xoá vĩnh viễn.

---

### Task 1: `develop/v1` — governance và comment updater

**Files:**
- Modify: `AGENTS.md` (khối "Branch Governance & Context", dòng 7-17)
- Modify: `docs/BRANCHING_AND_RELEASE_STRATEGY.md` (thay toàn bộ)
- Modify: `src/main/updater.ts:14,140` (comment)
- Modify: `tests/unit/updater.test.ts` (tiêu đề test, tên biến)

- [ ] **Step 1:** Trong worktree (nhánh `chore/remove-v2-remnants`, tách từ `develop/v1`), thay khối
  governance của `AGENTS.md`:

```markdown
## Branch Governance & Context

- **Product**: BS Coding
- **Current Version**: 1.3.4
- **Development Branch**: `develop/v1`
- **Stable / Release Branch**: `release/v1`
- **Release Tags**: `v1.*` (triggered from `release/v1` only)
- **Rules**:
  - All feature development lands in `develop/v1`.
  - Releases are merged from `develop/v1` to `release/v1` and tagged `v1.*`.
  - Maximum remote branches for repo = 3 (`main`, `develop/v1`, `release/v1`).
```

- [ ] **Step 2:** Thay toàn bộ `docs/BRANCHING_AND_RELEASE_STRATEGY.md` bằng:

```markdown
# BS Coding — Branching and Release Strategy

BS Coding is a single-track repository.

## 1. Topology

    main ── repository governance / default branch
    develop/v1 ── development
    release/v1 ── releases, published from v1.* tags

## 2. Branch Roles

| Branch | Role | Release Publishing | Tag Pattern |
|--------|------|--------------------|-------------|
| **`main`** | Repository governance & default branch | **NO** | **NO** |
| **`develop/v1`** | Active development | **NO** | **NO** |
| **`release/v1`** | Stable & maintenance releases | **YES** | `v1.*` (from `release/v1` only) |

## 3. Hard Rules

1. **Maximum remote branches = 3**: `main`, `develop/v1`, `release/v1`.
2. **Temporary branches are local-only** (`feature/*`, `bugfix/*`, `hotfix/*`, `codex/*`, `task/*`, `v1/p*`).
3. **`main` is governance-only**: no product code, no releases.
4. **Release source**: releases are published only from `release/v1` via `v1.*` tags. Merging
   `develop/v1` into `release/v1` can overwrite `release/v1`'s tag-publish `build.yml` — verify
   `on: push: tags: ['v1.*']` survives before tagging.

## 4. Auto-Update

- Discovery reads `https://github.com/tuannm711/BS-Coding/releases.atom`, keeps tags with the running
  app's major version and points electron-updater at the highest one.
- A guard rejects any update whose major version differs from the running app.
```

- [ ] **Step 3:** `src/main/updater.ts`:
  - dòng 14 → `// Extract major version from semver string (e.g. "1.3.2" -> 1, "v10.1.0" -> 10).`
  - dòng 140 → `      // Fetch release feed and find the latest release tag matching currentMajor.`
- [ ] **Step 4:** `tests/unit/updater.test.ts` — chỉ đổi chữ, không đổi dữ liệu/assertion:
  - `'T1/T2: Installed 1.3.2 discovers v1.4.1 (highest V1 release) ignoring V2 releases in feed'` →
    `'T1/T2: Installed 1.3.2 discovers v1.4.1 (highest same-major release) ignoring another major in feed'`
  - `'T3: Installed 1.4.0 with only V2 releases in feed returns null (no V1 update)'` →
    `'T3: Installed 1.4.0 with only another major in feed returns null'`
  - `'T2: V1 1.3.2 discovers v1.3.3 via feed even when GitHub latest is v2.0.0'` →
    `'T2: Installed 1.3.2 discovers v1.3.3 via feed even when GitHub latest is another major'`
  - `'T3: V1 1.4.0 with only V2 releases in feed emits up-to-date'` →
    `'T3: Installed 1.4.0 with only another major in feed emits up-to-date'`
  - biến `v2Tags` → `otherMajorTags`, `v2OnlyFeed` → `otherMajorFeed`.
- [ ] **Step 5:** Kiểm chứng: `npm run typecheck`, `npm test`, `npm run build` → PASS (số test không đổi).
  `git grep -nE '\bV2\b|develop/v2|release/v2' -- AGENTS.md docs/BRANCHING_AND_RELEASE_STRATEGY.md src tests` → rỗng.
- [ ] **Step 6:** Smoke: chạy `out/` bằng Playwright `_electron` với `BS_USER_DATA` tạm (Bash ngoài
  sandbox), title chứa "BS Coding", đóng app, xoá thư mục tạm.
- [ ] **Step 7:** Commit `chore: single-track governance and neutral updater wording`.

### Task 2: đưa lên `develop/v1`

- [ ] **Step 1:** `develop/v1` đang được checkout ở checkout chính, nên không cập nhật ref local từ
  worktree. Xác nhận fast-forward: `git merge-base --is-ancestor origin/develop/v1 chore/remove-v2-remnants`
  (nếu sai thì dừng và báo). Đẩy thẳng: `git push origin chore/remove-v2-remnants:develop/v1`.
- [ ] **Step 2:** Checkout chính: `git -C "C:/Users/brads/Documents/BS Coding" pull --ff-only` (checkout
  chính phải sạch; nếu không sạch thì dừng và báo).
- [ ] **Step 3:** Theo dõi CI của `develop/v1` (`gh run watch`) → xanh.

### Task 3: đưa sang `release/v1`

- [ ] **Step 1:** Trong worktree: `git checkout -B chore/release-sync origin/release/v1`,
  `git merge --no-ff develop/v1 -m "Merge branch 'develop/v1' into release/v1"`.
- [ ] **Step 2:** Xác nhận `.github/workflows/build.yml` vẫn có `tags: ['v1.*']` (nếu mất: lấy lại
  bằng `git checkout origin/release/v1 -- .github/workflows/build.yml` rồi commit).
- [ ] **Step 3:** Sửa comment dòng 10 của `build.yml`:
  `  # A v1.* tag on V2 source is a packaging error — fail fast.` →
  `  # A v1.* tag outside release/v1 history is a packaging error — fail fast.`; commit
  `ci: neutral tag-guard comment`.
- [ ] **Step 4:** Parse YAML (`python -c "import yaml; yaml.safe_load(open('.github/workflows/build.yml'))"`),
  rồi `git push origin chore/release-sync:release/v1` (fast-forward từ `origin/release/v1`). Không tag.
  Nhánh này không có CI khi push (workflow chỉ chạy theo tag). Cập nhật ref local:
  `git fetch origin && git branch -f release/v1 origin/release/v1`.

### Task 4: `main` — governance một dòng sản phẩm, xoá `docs/v2`

**Files:** `AGENTS.md`, `README.md`, `docs/RELEASES.md`, `docs/BRANCHING_AND_RELEASE_STRATEGY.md`; Delete `docs/v2/`.

- [ ] **Step 1:** `git checkout -B chore/main-single-track origin/main`.
- [ ] **Step 2:** `AGENTS.md`:

```markdown
# AGENTS.md

BS Coding — Repository Governance & Root Instructions

## Branch Governance & Context

- **Branch**: `main` (Repository Governance & Default Branch)
- **Rule**: **DO NOT develop product code here.**
- **Development**: `develop/v1` → `release/v1` (tag `v1.*`)
- **Maximum Remote Branches**: 3 (`main`, `develop/v1`, `release/v1`).

## Công nghệ

- Electron 41 + electron-vite 5 + React 19 + TypeScript (strict).
- PTY: `@lydell/node-pty`; terminal UI: `@xterm/xterm` + `@xterm/addon-fit`.
- Test: Vitest (unit + integration), Playwright (e2e).

## Cấu trúc

- `develop/v1` & `release/v1` — development and release lines.
- `docs/BRANCHING_AND_RELEASE_STRATEGY.md` — branching and release policy.
- `docs/RELEASES.md` — latest released version.
```

- [ ] **Step 3:** `README.md`:

```markdown
# BS Coding

BS Coding is an Electron desktop app for managing parallel coding agent sessions.

## Branching

**Do not develop product code directly on `main`.**

- Development: `develop/v1`
- Stable / Release: `release/v1`
- Release Tags: `v1.*`

For full details, see [`docs/BRANCHING_AND_RELEASE_STRATEGY.md`](docs/BRANCHING_AND_RELEASE_STRATEGY.md).
```

- [ ] **Step 4:** `docs/RELEASES.md`:

```markdown
# Releases

`main` is the governance/default branch and does not itself publish. Releases are published from
`release/v1` via `v1.*` tags; see the [GitHub Releases](https://github.com/tuannm711/BS-Coding/releases) page.

| Latest released version | Date | Status |
|-------------------------|------|--------|
| `1.3.4` | 2026-09-22 | Stable / maintenance |

## Conventions

- `main`'s `package.json` version equals the latest released version (currently `1.3.4`).
- On every release, update the row above, bump `main`'s `package.json` to the released version, and
  carry the `docs/release-notes/v<version>.md` file onto `main` (its version guard requires notes for
  the current version).
```

- [ ] **Step 5:** `docs/BRANCHING_AND_RELEASE_STRATEGY.md` = đúng nội dung của Task 1 Step 2.
- [ ] **Step 6:** `git rm -r -q docs/v2`.
- [ ] **Step 7:** Kiểm chứng: `git grep -nE 'BS Workflow|BS-Workflow|develop/v2|release/v2|\bV2\b' -- AGENTS.md README.md docs/RELEASES.md docs/BRANCHING_AND_RELEASE_STRATEGY.md`
  → rỗng; `ls docs` không còn `v2`.
- [ ] **Step 8:** Commit `docs(main): single-track governance; remove the V2 docs pack`;
  `git push origin chore/main-single-track:main` (fast-forward từ `origin/main`);
  `git fetch origin && git branch -f main origin/main`; CI (`gh run watch`) → xanh.

### Task 5: dọn nhánh local

- [ ] **Step 1:** `git branch -D wip/c05-parallel`; xoá các nhánh chore đã merge
  (`chore/remove-v2-remnants`, `chore/release-sync`, `chore/main-single-track`).
- [ ] **Step 2:** `git branch -a` chỉ còn `develop/v1`, `main`, `release/v1` (+ remote tương ứng).
  Worktree của phiên sẽ do chủ dự án xoá sau khi phiên kết thúc.

### Task 6: dữ liệu V2 sót trong userData

- [ ] **Step 1:** Xác nhận BS Coding không chạy (`tasklist /FI "IMAGENAME eq BS Coding.exe"`).
- [ ] **Step 2:** PowerShell (ngoài sandbox):

```powershell
Add-Type -AssemblyName Microsoft.VisualBasic
foreach ($d in @("$env:APPDATA\bs-coding\v2", "$env:APPDATA\bs-coding\v1-backups")) {
  if (Test-Path $d) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($d, 'OnlyErrorDialogs', 'SendToRecycleBin')
  }
}
```

- [ ] **Step 3:** Bash ngoài sandbox: hai thư mục không còn; các file khác của `%APPDATA%\bs-coding` không đổi
  (so số file trước/sau, trừ hai thư mục đã chuyển).

### Task 7: memory của dự án BS Coding

- [ ] **Step 1:** `bs-coding-product-goals.md`: xoá đoạn "V2 is now a separate product…".
- [ ] **Step 2:** `release-bump-main-version.md`: đoạn **Why** chỉ còn lý do `main` phải hiện bản mới
  nhất; bỏ câu về V2/sản phẩm khác.
- [ ] **Step 3:** `sandbox-appdata-view.md`: đoạn **Why** viết lại trung tính ("a production first-run
  check reported no state created twice before this was found").
- [ ] **Step 4:** `verify-production-path.md`: bỏ nhắc V2/C05; giữ bài học chung.
- [ ] **Step 5:** `MEMORY.md`: dòng product goals → "multi-account multi-provider in one session;
  orchestrator separate from chat"; dòng bump main giữ; không dòng nào nhắc V2/sản phẩm khác.

### Task 8: kiểm chứng cuối

- [ ] **Step 1:** Với `origin/main`, `origin/develop/v1`, `origin/release/v1`:
  `git grep -nE 'BS Workflow|BS-Workflow|develop/v2|release/v2' <branch>` → rỗng.
- [ ] **Step 2:** `git grep -nwE 'V2' <branch> -- AGENTS.md README.md docs/*.md src tests .github` → rỗng
  (tài liệu lịch sử trong `docs/reports`, `docs/superpowers` được phép).
- [ ] **Step 3:** `git ls-remote --heads origin` → đúng 3 nhánh; `git tag -l 'v2*'` rỗng.
- [ ] **Step 4:** Memory: `grep -lE 'BS Workflow|BS-Workflow|\bV2\b'` trong thư mục memory → rỗng.
