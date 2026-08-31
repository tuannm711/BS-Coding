# BS Coding 2

BS Coding is a workflow-first Electron desktop app for planning, executing and
reviewing software work with multiple coding runtimes. V2 replaces the old
terminal-pane product model with durable Projects and Work Sessions while still
using proven provider, Git, PTY, MCP, LSP, updater and remote-control adapters
behind typed main-process boundaries.

## Product model

- **Home** — recent Projects, active Work Sessions and items needing attention.
- **Projects** — repositories, workspace state, agents and historical work.
- **Work** — Conversation, Plan, Tasks, Execution, Changes and Review in one
  durable Work Session.
- **Agents** — immutable agent definitions/versions and project assignments.
- **Settings** — providers, security, permissions, updates and Remote Control.

Workflow state is deterministic application state. A model can produce text,
structured tool calls and evidence, but cannot directly mark tasks or workflows
complete. Blocking reviews create explicit rework and required gates rerun before
final verification.

## Runtime portability

Execution history is stored as provider-neutral canonical events. Switching a
provider, account or model closes the active Runtime Epoch and starts another in
the same Work Session. Narrated tool-like prose is never executable; only
validated structured tool calls can reach the permission and audit boundary.

Provider routing supports multiple enabled accounts and explicit
`AUTO`/`PREFERRED`/`PINNED` policies. Usage, quota confidence and workflow budgets
are persisted and projected through typed V2 APIs.

## Data and security

On first 2.0 startup, BS Coding snapshots known V1 sources, writes a SHA-256
backup manifest, imports compatible metadata/history idempotently and requires a
validated cutover report before enabling V2. The old V1 session store remains a
read-only rollback archive.

- Renderer V2 uses only `window.bs.v2`; the legacy `window.api` is not exposed.
- Secrets remain in the main-process vault and never enter renderer DTOs/events.
- Remote Control requires explicit enablement, short-lived pairing, `wss://`
  outside loopback, device revocation, command allowlists and local audit records.
- Electron runs with `contextIsolation: true` and `nodeIntegration: false`.

## Development

Requirements: Node.js 20+, Git, and platform build tools for Electron/node-pty.

```bash
npm install
npx @electron/rebuild -f -w @lydell/node-pty
npm run dev
```

Verification:

```bash
npm run typecheck
npm test
npm run build
npm run e2e
```

Packaging:

```bash
npm run dist
npm run dist:mac
npm run dist:linux
```

## Architecture

- `src/main/v2` — application/domain services, runtime, persistence and adapters.
- `src/shared/v2` — JSON-serializable contracts plus Zod boundary schemas.
- `src/renderer/src/v2` — React V2 shell and projection-driven screens.
- `src/main` — Electron/platform capabilities and compatibility adapters retained
  only where V2-native replacements do not yet exist.
- `src/browser-extension` — localhost-only paired Chrome MV3 bridge.
- `server` — optional Remote Control relay.

Start with [`docs/v2/START_HERE.md`](docs/v2/START_HERE.md) for the locked V2
architecture, then see [`docs/v2/acceptance-matrix.md`](docs/v2/acceptance-matrix.md)
and [`docs/v2/release-checklist.md`](docs/v2/release-checklist.md).

## Releases

CI builds supported platform artifacts from a `v*` tag and reads release notes
from `docs/release-notes/<tag>.md`. Do not create GitHub releases manually. The
complete verification and public-asset procedure is in the V2 release checklist.
