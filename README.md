# BS Coding V1

Desktop application (Electron + React) for managing parallel coding agent panes.

## Quickstart

### Prerequisites

- Node.js >= 20
- npm >= 9
- Windows, macOS, or Linux

### Installation

Download the latest installer or portable executable for your platform from the
[Releases](https://github.com/tuannm711/BS-Coding/releases) page.

- **Windows**: `BS.Coding.Setup.x.y.z.exe` (NSIS installer) or `BS.Coding.x.y.z.exe` (Portable)
- **Linux**: `BS.Coding-x.y.z.AppImage` or `.deb` package
- **macOS**: `.dmg` image or `.zip` archive

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

- **Development Branch**: `develop/v1`
- **Stable / Release Branch**: `release/v1`
- **Release Tags**: `v1.*` (triggered from `release/v1`)

GitHub Actions (`.github/workflows/build.yml`) builds Windows, macOS, and Linux installers when a
`v1.*` tag is pushed to `release/v1`. Tagged releases are published automatically — grab the
latest installers from the [Releases](https://github.com/tuannm711/BS-Coding/releases) page.

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
