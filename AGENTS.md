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
