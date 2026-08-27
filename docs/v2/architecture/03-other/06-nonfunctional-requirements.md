---
doc_id: NFR-001
title: "Non-Functional Requirements"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [performance, reliability, security, maintainability, offline]
depends_on: []
---

# 3.6 Non-Functional Requirements

## Reliability

- Durable command transitions survive renderer reload and normal app restart.
- No successful tool execution may be lost from audit history after its completion event is acknowledged.
- App crash must not corrupt SQLite; WAL and transactional migrations required.
- Provider/runtime outage must not corrupt Workflow/Task state.

## Performance

- UI projections for active WorkSession SHOULD update within 250 ms of main-process event under normal local load.
- Streaming text/tool events SHOULD appear progressively without waiting for task completion.
- Project file indexing/search must be incremental; opening a project must not require loading every file into memory.
- Large artifacts/tool logs should be paged/streamed, not inserted into renderer state wholesale.

## Security

- contextIsolation enabled; nodeIntegration disabled.
- secrets encrypted at rest and never rendered plaintext unless an explicit credential entry flow requires transient input.
- all privileged IPC inputs runtime-validated.
- narrated tool text never executable.

## Maintainability

- Domain modules should be small enough for focused AI coding/review; avoid “god manager” files.
- Interfaces and schemas live close to owning modules and have contract tests.
- Generated provider catalogs/data may be large but must be separated from behavior.
- Architecture IDs from this pack SHOULD be referenced in module docs/tests for traceability.

## Portability

Windows is a first-class target. Path/process/worktree behavior must be tested on Windows. macOS/Linux SHOULD remain supported where existing Electron packaging supports them.
