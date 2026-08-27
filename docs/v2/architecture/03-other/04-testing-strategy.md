---
doc_id: TEST-001
title: "Testing Strategy"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [tests, unit, contract, e2e, protocol, replay]
depends_on: []
---

# 3.4 Testing Strategy

## Test pyramid

### Unit
Domain state machines, DAG validation, router scoring, context selection, permission resolution, protocol guard, event schema/migrations, artifact policies.

### Contract
Each ProviderAdapter and NativeRuntimeAdapter runs against a deterministic recorded/fake transport. Contract tests verify canonical event mapping, structured tool calls, usage parsing, auth error classification and capability probe semantics.

### Workflow integration
Run complete WorkSession scenarios with fake model/runtime streams and real in-memory/temp SQLite + temp Git repositories. No real model calls in normal automated test suite.

### E2E
Playwright/Electron flows matching prototype: create project/session, approve plan, tasks execution projection, switch runtime, pause/resume/stop, provider account management, review→rework→final verification.

## Mandatory regression scenarios

- `[TEST-REG-01]` Model A uses tools, switch to Model B, B receives normalized canonical context and performs structured tool call; narrated call text is never executed.
- `[TEST-REG-02]` Same-model account fallback closes old epoch and creates new epoch while preserving WorkSession continuity.
- `[TEST-REG-03]` Duplicate ToolCall id executes at most once.
- `[TEST-REG-04]` Worker success cannot mark WorkflowRun completed while security gate fails.
- `[TEST-REG-05]` Pause stops new dispatch; resume continues same run; cancel preserves completed artifacts.
- `[TEST-REG-06]` Parallel write tasks use isolated worktrees and integrate deterministically.
- `[TEST-REG-07]` Renderer cannot retrieve secrets through preload/API.
- `[TEST-REG-08]` V1 migration is idempotent and preserves backup.

## Replay corpus

Maintain recorded canonical/native protocol fixtures for OpenAI/Codex, Anthropic/Claude, Google/Gemini, Copilot, OpenAI-compatible and native CLI adapters. Every provider adapter change replays the corpus.

## Verification commands

Before release/merge: typecheck, unit/integration test suite, E2E core flow, migration dry run and production Electron build for supported platforms.
