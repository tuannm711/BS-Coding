# AGENTS.md

BS Coding — desktop app (Electron + React) quản lý nhiều CLI coding agent (opencode, Claude Code,
aider, ...) chạy song song trong các pane terminal trên một cửa sổ.

## Branch Governance & Context

- **Product Track**: BS Coding V1
- **Current Version**: 1.3.3
- **Development Branch**: `develop/v1`
- **Stable / Release Branch**: `release/v1`
- **Release Tags**: `v1.*` (triggered from `release/v1` only)
- **Rules**:
  - All V1 feature development lands in `develop/v1`.
  - Releases are merged from `develop/v1` to `release/v1` and tagged `v1.*`.
  - Do not merge V2 code into this branch.
  - Maximum remote branches for repo = 5 (`main`, `release/v1`, `develop/v1`, `release/v2`, `develop/v2`).

## Công nghệ

- Electron 41 + electron-vite 5 + React 19 + TypeScript (strict).
- PTY: `@lydell/node-pty`; terminal UI: `@xterm/xterm` + `@xterm/addon-fit`.
- Test: Vitest (unit + integration), Playwright (e2e).

## Cấu trúc

3 tiến trình tách biệt, giao tiếp qua IPC contract tập trung:

- `src/main` — main process: PTY, stores, services, IPC handlers, vòng đời app.
- `src/preload` — contextBridge, expose `window.api` (implement `AgentApi`).
- `src/renderer` — React UI: sidebar, pane grid, xterm + native-agent chat.
- `src/shared` — types + IPC contract chung. **KHÔNG** import Node/Electron ở đây.
- `src/browser-extension` — Chrome MV3 extension (build riêng bằng esbuild → `out/browser-extension`,
  copy sang `userData/browser-extension/` để Load unpacked trên profile Chrome thật).
- `src/main/browser` — BrowserBridge (WS server local + pairing code) + Chrome launcher/hướng dẫn cài.

Alias `@shared` → `src/shared` (đã cấu hình trong electron.vite.config.ts, vitest.config.ts, tsconfig).

## Lệnh

- `npm run dev` — chạy dev (electron-vite; pre-hook tự build extension).
- `npm run build` / `npm run start` — build / preview (pre-hook tự build extension).
- `npm test` — unit + integration (Vitest).
- `npm run typecheck` — tsc node + web + extension.
- `npm run build:extension` — build Chrome extension (esbuild → `out/browser-extension`).
- `npm run e2e` — Playwright smoke (cần `npm run build` trước).
- `npm run dist` / `dist:dir` / `dist:linux` / `dist:mac` — đóng gói qua electron-builder.
- `npm run regen:models` — regenerate `src/main/models-snapshot.json`.

## Cài đặt trên Windows

- Sau `npm install`, nếu thiếu binding native cho node-pty:
  `npx @electron/rebuild -f -w @lydell/node-pty`.
- node-pty dùng prebuilds; đừng sửa code node-pty trực tiếp.

## Docs

- `docs/release-notes/` — chứa release notes theo tên tag (VD: `v1.3.2.md`).
