---
doc_id: COMP-EVENT-001
title: "Canonical Event Protocol"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [canonical-events, stream, tool-call, protocol, adapter]
depends_on: [COMP-DOMAIN-001]
---

# 2.2 Canonical Event Protocol

## Purpose

Provider SDK objects are not a durable contract. V2 defines one application-owned protocol used by model runtimes, native agent runtimes, Tool Executor, persistence and UI projections.

## Two event tiers

### A. Canonical Runtime Events — streaming / operational

May include high-frequency deltas. Required families:

```text
runtime.started
assistant.text.delta
assistant.reasoning.delta       # optional; never required for continuity
assistant.message.completed
tool.call.requested
tool.call.started
tool.call.completed
tool.call.failed
permission.requested
permission.resolved
runtime.usage
runtime.finish
runtime.error
runtime.cancelled
protocol.violation
```

### B. Durable Canonical Events — append-only audit

Persist only semantically meaningful records; deltas SHOULD be compacted into completed messages. Durable families include WorkSession/Workflow/Task/Agent/RuntimeEpoch lifecycle, completed assistant/user messages, structured tool calls/results, approvals, findings, artifacts, usage summaries and errors.

## Canonical envelope

```ts
interface CanonicalEvent<T = unknown> {
  id: string
  type: string
  schemaVersion: number
  timestamp: string
  projectId: string
  workSessionId?: string
  workflowRunId?: string
  taskRunId?: string
  agentRunId?: string
  runtimeEpochId?: string
  causationId?: string
  correlationId: string
  payload: T
}
```

## Tool contracts

```ts
interface CanonicalToolCall {
  callId: string
  toolName: string
  arguments: unknown
  origin: 'model' | 'native-runtime'
  requestedAt: string
}

interface CanonicalToolResult {
  callId: string
  status: 'success' | 'error' | 'denied' | 'cancelled'
  outputRef?: string
  preview?: string
  error?: { code: string; message: string }
  completedAt: string
}
```

## Protocol invariants

- `[COMP-EVENT-R01]` Provider-specific message/event classes MUST stop at adapter boundary.
- `[COMP-EVENT-R02]` Reasoning/thought signatures MAY be passed within one epoch when required by a provider, but MUST NOT be necessary for canonical continuity or cross-epoch replay.
- `[COMP-EVENT-R03]` Every `tool.call.completed/failed` MUST reference an existing canonical `callId`.
- `[COMP-EVENT-R04]` Duplicate `callId` execution MUST be rejected or idempotently replayed; never execute twice silently.
- `[COMP-EVENT-R05]` Assistant prose that resembles a tool call is `assistant.message.completed` text. It is not converted into `tool.call.requested`.
- `[COMP-EVENT-R06]` Schemas MUST be versioned and migration-capable.

## Adapter responsibility

Each runtime adapter translates both directions:

```text
Canonical Context → provider/native request format
provider/native stream → Canonical Runtime Events
```

Adapters MAY retain epoch-local metadata in an opaque `runtimeContext`, but the canonical event stream is the app-owned source of truth.
