---
doc_id: ARCH-OVR-001
title: "Mô tả tổng thể kiến trúc BS Coding V2.0.0"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "overall"
keywords: [architecture, overview, electron, workflow, agents, runtime]
depends_on: []
---

# 1. Mô tả tổng thể

## 1.1 Mục tiêu V2.0.0

BS Coding V2.0.0 is a **clean architectural rebuild** of the core execution model while preserving useful integrations and migrating compatible user data from V1.3.1. The product is no longer organized around terminal/chat panes. The primary user model is the one approved in the prototype:

```text
Project → Work Session → Goal → Plan → Tasks → Execution → Review → Result
```

Providers, accounts, models, native runtimes, tools, skills and terminals are supporting resources. They MUST NOT become the primary product workflow.

The architecture specifically solves two load-bearing V1 problems:

1. **Conversation/tool-protocol portability across models/providers.** Switching models MUST preserve the Work Session without reusing provider-native conversation state as the source of truth.
2. **Product architecture and UX complexity.** The backend MUST expose project/work/task/review state directly so the UI can render the approved workflow instead of reconstructing it from multiple chat sessions.

## 1.2 Target system shape

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer / React UI — approved Figma behavior                      │
│ Home · Project · Work · Agents · Settings                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Typed preload API / events
┌──────────────────────────────▼──────────────────────────────────────┐
│ Application Services / Command + Query Boundary                    │
│ Project · WorkSession · Workflow · Agent · Provider · Settings     │
└───────────────┬────────────────────────────┬────────────────────────┘
                │                            │
       ┌────────▼────────┐          ┌────────▼─────────┐
       │ Workflow Engine │          │ Runtime Platform │
       │ DAG/state/gates │          │ providers/models │
       └───────┬─────────┘          └────────┬─────────┘
               │                             │
       ┌───────▼─────────┐          ┌────────▼─────────┐
       │ Agent Runtime    │◄────────►│ Context Compiler │
       │ task execution   │          │ canonical→native │
       └───────┬─────────┘          └────────┬─────────┘
               │                             │
       ┌───────▼─────────────────────────────▼──────────┐
       │ Canonical Event Protocol + Protocol Guard      │
       └───────┬─────────────────────────────┬──────────┘
               │                             │
       ┌───────▼─────────┐          ┌────────▼─────────┐
       │ Tool Executor    │          │ Provider/Native  │
       │ permissions/MCP  │          │ Runtime Adapters │
       └───────┬─────────┘          └──────────────────┘
               │
       ┌───────▼────────────────────────────────────────┐
       │ Persistence / Audit / Artifacts / Workspace    │
       │ SQLite + filesystem + safeStorage + Git        │
       └────────────────────────────────────────────────┘
```

## 1.3 Architectural layers

| Layer | Owns | Must not own |
|---|---|---|
| Renderer | presentation, local view state, user gestures | filesystem, secrets, workflow transitions, provider SDKs |
| Preload/IPC | typed transport, validation, subscriptions | business policy |
| Application services | commands/queries, authorization boundary, use-case composition | provider-specific message formats |
| Domain/workflow | WorkSession/Task/Review state, deterministic transitions | React, Electron UI, provider SDKs |
| Runtime platform | provider accounts, models, native runtime targets, routing | user-facing workflow state |
| Agent runtime | execution of one AgentRun against TaskEnvelope | global scheduling decisions |
| Tool platform | structured calls, permission, tool execution, MCP/LSP | interpreting assistant prose as executable intent |
| Persistence | durable state, audit events, artifacts, migration | deciding business transitions |

## 1.4 Core invariants

- `[ARCH-OVR-INV-01]` Main process MUST be the authoritative backend for process, filesystem, secrets, provider connections and workflow execution.
- `[ARCH-OVR-INV-02]` Durable conversation/work history MUST be stored in a provider-neutral canonical representation.
- `[ARCH-OVR-INV-03]` A provider/model/account change MUST create a new Runtime Epoch. It MUST NOT silently continue a raw provider-native conversation across the boundary.
- `[ARCH-OVR-INV-04]` Only structured canonical `ToolCall` events may enter Tool Executor. Assistant text MUST NEVER be parsed and executed as a tool call.
- `[ARCH-OVR-INV-05]` Workflow/task state MUST be deterministic application state. LLM output may propose state changes but MUST NOT be the state machine.
- `[ARCH-OVR-INV-06]` Workers MUST NOT recursively fan out work by default. Orchestration is controlled by Workflow Engine + Orchestrator policy.
- `[ARCH-OVR-INV-07]` Every code-writing TaskRun SHOULD use an isolated Git worktree/branch unless the task is explicitly configured for a shared workspace.
- `[ARCH-OVR-INV-08]` Work Session completion MUST require configured quality gates; no worker may independently mark the session complete.
- `[ARCH-OVR-INV-09]` Secrets MUST remain in the main process and encrypted credential vault; renderer receives only masked/non-secret metadata.
- `[ARCH-OVR-INV-10]` Prototype source code MUST NOT be copied wholesale into production. The prototype defines behavior and information architecture.

## 1.5 Compatibility strategy

V2 is not an in-place refactor of the V1 runtime loop. Existing provider integrations, tools, MCP/LSP logic and useful UI utilities MAY be ported behind new interfaces, but V1 abstractions MUST NOT dictate V2 boundaries. Migration is handled explicitly in `MIG-001`.

## 1.6 Definition of “architecture locked”

This document pack is considered the V2 target architecture. Implementation MAY change internal algorithms without revising the spec when interfaces and invariants remain intact. A change to entity ownership, canonical event semantics, runtime switching behavior, security boundaries, workflow state machine or completion gates requires a spec revision before implementation.
