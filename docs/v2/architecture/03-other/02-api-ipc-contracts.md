---
doc_id: CONTRACT-001
title: "API / IPC Contracts"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [ipc, preload, commands, queries, events, zod]
depends_on: []
---

# 3.2 API / IPC Contracts

## Goal

Replace a large collection of ad-hoc IPC channels with namespaced, typed contracts while keeping Electron security boundaries.

## Contract families

```text
project.*
workSession.*
workflow.*
task.*
agent.*
provider.*
workspace.*
git.*
skill.*
mcp.*
settings.*
diagnostics.*
remote.*
```

Use command/query/subscription semantics:

```ts
project.get(id) -> ProjectDetail
workSession.create(input) -> WorkSessionDetail
workSession.pause(id) -> CommandResult
workSession.switchRuntime(input) -> RuntimeEpochSummary
workflow.subscribe(runId) -> ProjectionEvent
provider.listAccounts() -> ProviderSummary[]
```

## Rules

- Every input/output schema MUST be explicit and runtime-validated (Zod or equivalent).
- Preload exposes a minimal typed API under one namespace such as `window.bs`.
- Renderer MUST NOT receive raw filesystem handles, tokens, provider clients or Node process objects.
- Subscription events MUST include monotonic revision/sequence so renderer can detect gaps and refetch projection.
- Commands MUST be idempotent where practical or carry request id/idempotency key for consequential operations.

## Internal application ports

Application services depend on ports (`ProviderPort`, `RuntimePort`, `WorkspacePort`, `EventStore`, `ArtifactStore`, `Clock`, `IdGenerator`) so tests can use deterministic fakes.
