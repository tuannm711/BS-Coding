---
doc_id: COMP-WF-001
title: "Workflow / Task Graph Engine"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [workflow, dag, scheduler, task, state-machine, dependencies]
depends_on: [COMP-DOMAIN-001, COMP-AGENTRT-001]
---

# 2.8 Workflow / Task Graph Engine

## Purpose

Owns deterministic lifecycle, DAG validation, task readiness, concurrency, retries, rework and completion. The Orchestrator proposes plans and assignments; the engine enforces them.

## Plan contract

A PlanVersion contains goal, technical approach, risks, Task definitions, dependencies, acceptance criteria, suggested agent capability/role and quality gates.

Before execution the engine MUST validate:

- unique Task ids;
- no dependency cycles;
- every dependency exists;
- each executable Task has acceptance criteria or explicit “informational” type;
- required capability/permission can be satisfied by at least one eligible Agent;
- concurrency/workspace conflicts are resolvable;
- quality gates reference valid scopes.

## Scheduler

A task is ready when all blocking dependencies are completed and approvals/resources are satisfied. Scheduler SHOULD run independent tasks in parallel subject to configured concurrency, workspace isolation and budget limits.

## State ownership

Agents emit outcome events; Workflow Engine transitions TaskRun/WorkflowRun. No LLM may directly write status columns in persistence.

## Retry/rework

- transient runtime/provider failure: retry same TaskRun attempt according to policy, potentially new RuntimeEpoch;
- implementation failure: new TaskRun attempt or rework Task linked to Finding;
- review failure: deterministic transition to `REWORKING`, new rework work item, then required gates rerun.

## Pause/cancel

Pause stops new dispatch and requests safe suspension/cancellation of active runs. Cancel permanently closes the WorkflowRun while preserving history. See `STATE-001`.

## Recursive delegation

V2 default is star topology: Workflow Engine/Orchestrator dispatches workers. Worker agents MUST NOT recursively create independent workers unless a future explicit policy enables it. This prevents invisible work, cycles and uncontrolled quota spend.
