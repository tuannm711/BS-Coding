# P15 Runtime Target Query Amendment Design

## Decision

P15 Task 3 adds `workSession.runtimeTargets` to the typed V2 API. Main resolves
selectable runtime candidates from provider/account/model state; renderer never
constructs account routing or capability truth.

## Contract

The query is scoped by `projectId` and `workSessionId`, validates ownership, and
returns secret-free candidates containing display labels, account health,
selectability, an optional unavailable reason, and the exact `RuntimeTarget`
accepted by `workSession.switchRuntime`.

Legacy provider storage may be read only through a structural infrastructure
adapter. Declared V1 tool support is not promoted to VERIFIED: false maps to
UNSUPPORTED and all other legacy values map conservatively to UNKNOWN.

## Acceptance

- Foreign WorkSession scope is rejected before provider data is read.
- No key ref, credential, provider client or raw model object crosses IPC.
- Renderer sends back only a candidate target returned by main.
- Registry, Zod schemas, route, preload and Electron flow remain in parity.
