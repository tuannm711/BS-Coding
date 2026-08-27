---
doc_id: COMP-SESSION-001
title: "Work Session, Workflow Run và Runtime Epoch"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [work-session, workflow-run, runtime-epoch, switch-model, pause, cancel]
depends_on: [COMP-DOMAIN-001, COMP-EVENT-001]
---

# 2.3 Work Session, Workflow Run và Runtime Epoch

## Separation of concepts

- **Work Session:** user-visible continuity: “Google OAuth Login”.
- **Workflow Run:** one deterministic execution attempt of the Work Session.
- **Agent Run:** one agent working one assignment.
- **Runtime Epoch:** one continuous runtime target inside an AgentRun.

This separation is mandatory because model/account switching and “Resume as New Run” are different operations.

## Runtime Epoch model

Fields SHOULD include `id`, `agentRunId`, `sequence`, `runtimeType`, `providerId`, `accountId`, `modelId`, `nativeRuntimeId`, `startedAt`, `endedAt`, `endReason`, `capabilitySnapshot`, `usageSummary`, `runtimeContextRef`.

`endReason`: `completed | user-switch | fallback | quota-refusal | capability-degraded | provider-error | cancelled | superseded`.

## Runtime switching

When runtime changes:

1. Stop/finish current step safely.
2. Persist canonical checkpoint and close current epoch.
3. Context Compiler builds target-safe context.
4. Router selects/resolves target account/model.
5. Start a new epoch.
6. Continue same AgentRun unless workflow policy explicitly reassigns the task.

The UI MUST show a runtime-changed event and history for the primary Work Session agent; worker epoch history MAY be shown in task details.

## Pause / Resume / Stop semantics

- **Pause:** Workflow Engine stops dispatching new work and requests active AgentRuns to suspend/cancel at safe execution boundaries. Durable state is preserved. Resume continues the same WorkflowRun.
- **Stop/Cancel:** active work is cancelled, WorkflowRun becomes `CANCELLED`, completed results remain immutable/history-visible.
- **Resume as New Run:** creates a new WorkflowRun from the last approved plan/checkpoint; it does not rewrite the cancelled run.

## Invariants

- `[COMP-SESSION-R01]` Cross-provider/model continuation MUST always cross an epoch boundary.
- `[COMP-SESSION-R02]` Account fallback during a turn also creates a new epoch; “same turn id with invisible account swap” is not allowed in V2.
- `[COMP-SESSION-R03]` Work Session id remains stable across epochs and WorkflowRuns.
- `[COMP-SESSION-R04]` Cancelled/Completed WorkflowRuns are immutable except metadata/annotations.
