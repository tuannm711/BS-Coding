# AGENTS.md

BS Coding — Repository Governance & Root Instructions

## Branch Governance & Context

- **Branch**: `main` (Repository Governance & Default Branch)
- **Rule**: **DO NOT develop product code here.**
- **Development track**:
  - **BS Coding (V1)**: `develop/v1` → `release/v1` (tag `v1.*`)
- **V2 moved out (2026-09-25)**: the V2 rebuild is now the separate product **BS Workflow**
  in `tuannm711/BS-Workflow`. It installs alongside BS Coding and shares no data, identity or
  releases with it. Do not recreate `develop/v2` or `release/v2` here.
- **Maximum Remote Branches**: 3 (`main`, `develop/v1`, `release/v1`).

## Công nghệ

- Electron 41 + electron-vite 5 + React 19 + TypeScript (strict).
- PTY: `@lydell/node-pty`; terminal UI: `@xterm/xterm` + `@xterm/addon-fit`.
- Test: Vitest (unit + integration), Playwright (e2e).

## Cấu trúc

- `release/v1` & `develop/v1` — BS Coding maintenance line.
- `docs/v2/` — historical copy of the V2 architecture pack as of the move; the living copy is
  in `tuannm711/BS-Workflow`.
- `docs/BRANCHING_AND_RELEASE_STRATEGY.md` — branching and release policy.
- `docs/RELEASES.md` — latest released version.
