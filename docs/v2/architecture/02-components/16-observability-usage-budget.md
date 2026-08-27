---
doc_id: COMP-OBS-001
title: "Observability, Usage và Budget"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [logs, metrics, usage, cost, budget, correlation]
depends_on: [COMP-DATA-001, COMP-PROVIDER-001]
---

# 2.16 Observability, Usage và Budget

## Structured telemetry

Every runtime/workflow event SHOULD carry correlation identifiers: `projectId`, `workSessionId`, `workflowRunId`, `taskRunId`, `agentRunId`, `runtimeEpochId`, `toolCallId` when applicable.

Logs use structured records with severity/category/source. User-facing Logs panel is a projection, not raw console dumping.

## Usage model

Track provider-reported usage and locally observed usage separately. UsageRecord SHOULD include account, provider, model, runtime epoch, request count, input/output/cached tokens when available, estimated cost, provider period key and confidence/source.

## Budgets

BudgetPolicy MAY specify soft/hard limits by WorkSession/WorkflowRun: cost, requests, tokens, concurrency or elapsed runtime. Hard limits require deliberate user/project configuration; V2 MUST NOT invent arbitrary defaults.

Soft thresholds can trigger warnings or routing preference changes. Router must distinguish quota/capacity from user budget.

## Diagnostics export

Global Settings diagnostics export SHOULD include redacted structured logs, schema/app version, provider capability metadata and runtime errors, never secrets or full source files by default.
