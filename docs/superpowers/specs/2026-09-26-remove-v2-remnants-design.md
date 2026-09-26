# Gỡ phần còn sót của V2 khỏi BS Coding

Ngày: 2026-09-26
Nhánh: `chore/remove-v2-remnants` (local, tách từ `develop/v1`)
Trạng thái: chờ chủ dự án duyệt

## Bối cảnh

Dòng V2 đã rời khỏi repo này: `develop/v2` và `release/v2` bị xoá ngày 2026-09-25, nên BS Coding
chỉ còn một dòng sản phẩm. Tuy vậy repo, máy local và memory vẫn còn nội dung V2 hoặc chỉ dẫn tới
nơi V2 đã chuyển đi.

## Mục tiêu

Repo, các nhánh, máy local và memory của BS Coding không còn nội dung, đường dẫn hay lời chỉ dẫn nào
về V2 hoặc sản phẩm kế nhiệm. Hành vi của app giữ nguyên, không phát hành bản mới.

## Thay đổi

### 1. Nhánh `main` (governance)

- Viết lại `AGENTS.md`, `README.md`, `docs/RELEASES.md` và `docs/BRANCHING_AND_RELEASE_STRATEGY.md`
  theo mô hình một dòng sản phẩm: `main` / `develop/v1` / `release/v1`, tag `v1.*`, tối đa 3 nhánh
  remote. Không nhắc V2, `develop/v2`, `release/v2` hay sản phẩm nào khác.
- Xoá `docs/v2/` (62 file kiến trúc V2).

### 2. Nhánh `develop/v1`, sau đó `release/v1`

- `AGENTS.md`: sửa phần governance (tối đa 3 nhánh remote; bỏ dòng "không merge V2" và các nhánh v2).
- `docs/BRANCHING_AND_RELEASE_STRATEGY.md`: một dòng sản phẩm, cùng nội dung với bản trên `main`.
- `src/main/updater.ts`: sửa comment, bỏ ví dụ `v2.*`/"V2". **Hành vi giữ nguyên**: vẫn chỉ nhận bản
  cùng major.
- `tests/unit/updater.test.ts`: đổi tiêu đề test đang dùng chữ "V2" thành mô tả trung tính (ví dụ
  "ignores releases of another major"). Dữ liệu semver giữ nguyên.
- `.github/workflows/build.yml` trên `release/v1`: sửa comment tag-guard "A v1.* tag on V2 source"
  thành "a v1.* tag outside release/v1 history".
- Merge `develop/v1` → `release/v1` theo luật canh workflow tag-publish (`on: push: tags: ['v1.*']`
  phải còn nguyên). Không tag, không release.
- Tài liệu lịch sử (report provider-auth, plan/spec 1.3.3–1.3.4, note fleet) chỉ nhắc V2 như bối cảnh
  thời điểm đó, nên **giữ nguyên**.

### 3. Máy local

- Xoá nhánh local `wip/c05-parallel`, là việc V2 dở dang.
- Worktree `.claude/worktrees/bs-coding-v1-3-3-release-d5127b` chỉ xoá được sau khi phiên Claude đang
  chạy trong nó kết thúc. Chủ dự án xoá, hoặc dùng công cụ dọn worktree.

### 4. Dữ liệu app

- Đóng BS Coding, rồi chuyển `%APPDATA%\bs-coding\v2` (43 MB) và `%APPDATA%\bs-coding\v1-backups`
  (41 MB) vào **Recycle Bin**. App không dùng hai thư mục này. Chủ dự án tự Empty Recycle Bin để xoá
  hẳn.

### 5. Memory của dự án BS Coding

- Bỏ mọi nhắc tới V2 đã chuyển đi và sản phẩm kế nhiệm trong `bs-coding-product-goals`,
  `release-bump-main-version`, `sandbox-appdata-view`, `verify-production-path` và `MEMORY.md`. Bài
  học chung vẫn giữ.

## Kiểm chứng

- Trên `develop/v1`: `npm run typecheck`, `npm test`, `npm run build`.
- Chạy smoke bản build V1 với `BS_USER_DATA` tạm: app mở, title "BS Coding".
- Grep trên cả 3 nhánh không còn `BS Workflow`, `BS-Workflow`, `develop/v2`, `release/v2`; `V2` chỉ
  còn trong tài liệu lịch sử đã nêu ở mục 2.
- `release/v1`: `build.yml` vẫn có `tags: ['v1.*']`.
- Sau khi push, CI của `main`, `develop/v1` và `release/v1` đều xanh.

## Hành động ra ngoài (duyệt cùng spec)

- Push `main`, `develop/v1`, `release/v1`.
- Chuyển hai thư mục dữ liệu vào Recycle Bin.
