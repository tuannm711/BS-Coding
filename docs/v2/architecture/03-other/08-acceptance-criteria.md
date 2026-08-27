---
doc_id: AC-001
title: "Architecture Acceptance Criteria"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [acceptance, gates, v2, done]
depends_on: []
---

# 3.8 Architecture Acceptance Criteria for V2.0.0

V2 architecture is implementation-complete only when all blocking criteria pass.

## Core

- `AC-CORE-01` Approved prototype primary flows are available without terminal/chat-pane-centric navigation.
- `AC-CORE-02` WorkSession/Workflow/Task/Agent/RuntimeEpoch entities persist and recover after restart.
- `AC-CORE-03` Workflow state is deterministic and testable without a real model.

## Runtime portability

- `AC-RUN-01` Switch provider/model/account starts a new RuntimeEpoch and continues same WorkSession.
- `AC-RUN-02` Canonical context can be reconstructed after app restart without provider-native conversation objects.
- `AC-RUN-03` Narrated tool text is never executed; protocol violation/retry/degraded UX works.

## Providers/routing

- `AC-PROV-01` Multiple enabled accounts can coexist; AUTO/PREFERRED/PINNED behave as specified.
- `AC-PROV-02` Router is sticky per epoch and handles cooldown/quota refusal by epoch handoff.
- `AC-PROV-03` Capability probe prevents unsupported/degraded tool runtimes from silently performing coding work.

## Workflow/team

- `AC-WF-01` Parallel independent tasks execute with validated dependencies.
- `AC-WF-02` Parallel write tasks are isolated in worktrees.
- `AC-WF-03` Orchestrator cannot write code with default permissions.
- `AC-WF-04` Review failure creates rework and gates rerun before completion.

## Security/data

- `AC-SEC-01` Secrets remain outside renderer and are redacted from logs/events.
- `AC-SEC-02` MCP/native runtime paths cannot bypass permission/audit boundary.
- `AC-DATA-01` V1 migration is backup-first and idempotent.

## UX/prototype

- `AC-UX-01` Main nav: Home, Projects, Work, Agents, Settings only.
- `AC-UX-02` Work tabs: Conversation, Plan, Tasks, Execution, Changes, Review.
- `AC-UX-03` Pause/Resume/Stop/Cancelled/Resume-as-New-Run semantics match prototype.
- `AC-UX-04` Review demo states map to real backend states, not hard-coded UI-only strings.
