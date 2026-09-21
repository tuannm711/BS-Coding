# BS Coding V1 (Development)

Desktop application (Electron + React) for managing parallel coding agent panes.

## Quickstart

### Prerequisites

- Node.js >= 20
- npm >= 9
- Windows, macOS, or Linux

## Development

```bash
npm install
npx @electron/rebuild -f -w @lydell/node-pty   # Windows: rebuild native binding if missing
npm run dev                                    # start electron-vite dev
```

Other commands:

```bash
npm run build       # build
npm run start       # preview build
npm run dist        # package Windows installer (NSIS + portable)
npm run dist:linux  # package Linux (AppImage + deb)
npm run dist:mac    # package macOS (dmg + zip; must run on macOS)
```

### Branching & Releases

- **Current Product Line**: BS Coding V1
- **Development Branch**: `develop/v1`
- **Target Release Branch**: `release/v1`
- **Release Tags**: `v1.*` (triggered from `release/v1` only)
- **Strategy Document**: [`docs/BRANCHING_AND_RELEASE_STRATEGY.md`](docs/BRANCHING_AND_RELEASE_STRATEGY.md)

Develop features on `develop/v1`. When a release candidate is verified, merge to `release/v1` and tag `v1.*`.

## Testing

```bash
npm test                    # unit + integration (Vitest)
npm run typecheck           # tsc for node, web, extension, and server
npm run build && npm run e2e # Playwright smoke test
```

## Notes

- Quitting the app kills every running agent, including child processes (tree-kill).
- Persistent data lives under `userData/`: templates, workspaces, sessions, logs, commands,
  permissions, and snapshots.
- Bundled skill assets (Anthropic skills) are Apache-2.0 and ship with their original license files
  under `resources/skills/`.
