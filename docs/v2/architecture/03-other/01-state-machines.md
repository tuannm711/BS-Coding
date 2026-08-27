---
doc_id: STATE-001
title: "State Machines"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [states, workflow-status, task-status, runtime-status]
depends_on: []
---

# 3.1 State Machines

## WorkflowRun

```text
RECEIVED → ANALYZING → PLANNING → WAITING_APPROVAL → EXECUTING
                                              ↓
EXECUTING → INTEGRATING → REVIEWING → VERIFYING → COMPLETED
                           ↓            ↑
                        REWORKING ───────┘
```

Cross-cutting states: `PAUSED`, `BLOCKED`, `FAILED`, `CANCELLED`. Resume from PAUSED returns to the prior active phase. CANCELLED/COMPLETED are terminal.

## TaskRun

```text
QUEUED → READY → RUNNING → COMPLETED
   ↓       ↓       ├→ WAITING_APPROVAL
 BLOCKED   │       ├→ FAILED
           │       ├→ CANCELLED
           │       └→ REVIEW_FAILED → REWORK
```

A logical Task can have multiple TaskRuns/attempts. The graph node's final state is derived from accepted successful run + required review state.

## AgentRun

`CREATED → STARTING → RUNNING → SUCCEEDED | FAILED | BLOCKED | CANCELLED | DEGRADED`.

## RuntimeEpoch

`STARTING → ACTIVE → CLOSING → CLOSED`. Epoch is never resumed after CLOSED; a new epoch is created.

## WorkSession

User-facing state: `PLANNING | EXECUTING | PAUSED | REVIEW | REWORK | VERIFYING | COMPLETED | CANCELLED | FAILED | BLOCKED`. It is a projection of active WorkflowRun, not separately hand-edited.

## Transition rule

All transitions MUST be implemented as named domain commands/events and validated centrally. UI components, provider adapters and agents MUST NOT set arbitrary status strings.
