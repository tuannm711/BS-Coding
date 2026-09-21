# AGENTS.md

BS Coding — Repository Governance & Root Instructions

## Branch Governance & Context

- **Branch**: `main` (Repository Governance & Default Branch)
- **Rule**: **DO NOT develop product code here.**
- **Development tracks**:
  - **BS Coding V1**: `develop/v1` → `release/v1` (tag `v1.*`)
  - **BS Coding V2**: `develop/v2` → `release/v2` (tag `v2.*`)
- **Maximum Remote Branches**: 5 (`main`, `release/v1`, `develop/v1`, `release/v2`, `develop/v2`).

## Công nghệ

- Electron 41 + electron-vite 5 + React 19 + TypeScript (strict).
- PTY: `@lydell/node-pty`; terminal UI: `@xterm/xterm` + `@xterm/addon-fit`.
- Test: Vitest (unit + integration), Playwright (e2e).

## Cấu trúc

- `release/v1` & `develop/v1` — BS Coding V1 maintenance line.
- `develop/v2` — BS Coding V2 active development line.
- `docs/v2/` — V2 architecture documentation pack.
- `docs/BRANCHING_AND_RELEASE_STRATEGY.md` — Dual-track branching policy.
