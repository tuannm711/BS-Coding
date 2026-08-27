---
doc_id: COMP-DOMAIN-001
title: "Domain Model"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [domain, entities, ownership, ids]
depends_on: [ARCH-OVR-001]
---

# 2.1 Domain Model

## Purpose

Defines the canonical entities and ownership boundaries used by every V2 module. IDs MUST be opaque UUID/ULID-style application identifiers; UI display names/codes MUST NOT be used as relational keys.

## Aggregate roots

### Project
Owns project-scoped configuration and references a real repository/workspace.

Minimum fields: `id`, `name`, `repoPath`, `defaultBranch`, `instructionsRef`, `createdAt`, `updatedAt`, `archivedAt`.

Project owns references to AgentDefinitions, project Skills, MCP configurations and default Work policies.

### WorkSession
User-facing long-lived container for one goal/initiative. Fields: `id`, `projectId`, `title`, `goal`, `status`, `activeWorkflowRunId`, `createdAt`, `updatedAt`, `completedAt`, `cancelledAt`.

A WorkSession MAY contain multiple WorkflowRuns over its lifetime, e.g. `Resume as New Run` after cancellation.

### WorkflowRun
Deterministic execution instance inside a WorkSession. Owns PlanVersion selection, Task graph state, scheduler state, budget counters and quality-gate state.

### Task / TaskRun
`Task` is the logical plan node. `TaskRun` is an execution attempt. Rework MUST create a new Task or new run according to policy while preserving provenance to the failed finding/task.

### AgentDefinition / AgentVersion
AgentDefinition is stable identity; AgentVersion is immutable configuration snapshot used for an AgentRun. Running work MUST reference an AgentVersion, not mutable live settings.

### AgentRun
One agent executing one assignment. Owns RuntimeEpochs and a canonical conversation/event stream. The same AgentRun may cross runtime targets through multiple RuntimeEpochs.

### RuntimeEpoch
Immutable runtime-target segment: provider/account/model/native-runtime + start/end + reason. See `COMP-SESSION-001`.

### Review / Finding / QualityGate
Review records the reviewer and scope. Finding has severity/status/evidence. QualityGate combines deterministic checks or review conditions into a pass/fail/blocked decision.

### Artifact / ChangeSet
Artifact is immutable output reference; ChangeSet captures Git diff/worktree/commit provenance.

## Relationship sketch

```text
Project
 ├─ AgentDefinition ─ AgentVersion
 ├─ SkillBinding
 ├─ MCPBinding
 └─ WorkSession
     └─ WorkflowRun
         ├─ PlanVersion
         ├─ Task ─ TaskDependency
         │   └─ TaskRun
         │       └─ AgentRun
         │           └─ RuntimeEpoch
         │               └─ CanonicalEvent*
         ├─ Artifact*
         ├─ Review* ─ Finding*
         └─ QualityGate*
```

## Ownership rules

- `[COMP-DOMAIN-R01]` Task status is owned by Workflow Engine; agents report outcomes only.
- `[COMP-DOMAIN-R02]` AgentDefinition changes MUST NOT mutate already-running AgentVersion snapshots.
- `[COMP-DOMAIN-R03]` Provider accounts are global resources; Agent runtime policy references them by routing policy rather than copying credentials.
- `[COMP-DOMAIN-R04]` WorkSession state is derived from active WorkflowRun and quality gates, not from chat text.
- `[COMP-DOMAIN-R05]` Every execution/audit record MUST carry correlation IDs sufficient to trace Project → WorkSession → WorkflowRun → TaskRun → AgentRun → RuntimeEpoch.
