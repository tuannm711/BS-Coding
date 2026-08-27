---
doc_id: COMP-DATA-001
title: "Persistence, Audit và Event Store"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [sqlite, persistence, event-store, artifact, projection, audit]
depends_on: [COMP-DOMAIN-001, COMP-EVENT-001]
---

# 2.12 Persistence, Audit và Event Store

## Storage strategy

Use a hybrid local persistence model:

1. **SQLite (WAL)** for structured domain state, projections, indexes and durable canonical events.
2. **Filesystem artifact store** for large immutable tool outputs, logs, patches, screenshots and exported artifacts.
3. **Electron safeStorage vault** for secrets/tokens. SQLite stores only secret references/metadata.
4. **Git repositories/worktrees** for source-of-truth code changes.

V2 does NOT require full event sourcing. Relational current-state tables are first-class; append-only canonical events provide audit/replay/provenance.

## Core table groups

- projects / project_settings
- work_sessions / workflow_runs / plans / tasks / task_dependencies / task_runs
- agent_definitions / agent_versions / agent_runs / runtime_epochs
- provider_accounts / model_capabilities / provider_usage / pool_state
- canonical_events / messages / tool_calls / permission_decisions
- artifacts / changesets
- reviews / findings / quality_gates / approvals
- usage_records / budgets
- schema_migrations / import_history

## Event store rules

Events are append-only. Corrections use compensating/new events or mutable projection tables; never rewrite execution history. Large payloads are stored as artifact references.

## Transactions

Domain transition and its durable event MUST commit atomically where possible. Starting a TaskRun, assigning AgentVersion, reserving workspace and emitting lifecycle event SHOULD be one application transaction or a recoverable saga with explicit intermediate state.

## Recovery

On startup the app detects incomplete active runs, marks orphaned runtime processes as interrupted, rehydrates projections, and offers safe resume/retry. No background process is assumed alive after app crash unless explicitly managed by a durable native runtime integration.
