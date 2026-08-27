---
doc_id: ARCH-FLOW-001
title: "Luồng hệ thống và dữ liệu end-to-end"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "overall"
keywords: [data-flow, sequence, work-session, runtime-epoch, tool-call]
depends_on: []
---

# 1. Luồng hệ thống và dữ liệu end-to-end

## 1.1 Standard Work Session flow

```text
User Goal
  ↓
WorkSessionService.create
  ↓
Orchestrator/Architect proposes Plan
  ↓
Workflow Engine validates DAG + acceptance criteria
  ↓
WAITING_APPROVAL (if policy requires)
  ↓
WorkflowRun EXECUTING
  ↓
Scheduler selects ready TaskRuns
  ↓
AgentAssignment + RuntimeRouter
  ↓
AgentRun / RuntimeEpoch
  ↓
Context Compiler → Runtime Adapter
  ↓
Canonical Runtime Events
  ↓
Protocol Guard
  ├─ Assistant text → transcript projection
  ├─ ToolCall → permission → Tool Executor → ToolResult
  └─ Error → recovery policy
  ↓
Task result + artifacts + changeset
  ↓
Integration
  ↓
Mechanical gates + AI review gates
  ↓
Rework loop when needed
  ↓
Final Verification
  ↓
COMPLETED
```

## 1.2 Model/runtime switch flow

```text
Current Runtime Epoch
  ↓ user switch / router fallback
Close epoch with reason
  ↓
Persist final canonical events/checkpoint
  ↓
Context Compiler selects relevant canonical history
  ↓
Target adapter projects canonical context to target-native protocol
  ↓
Start NEW Runtime Epoch
  ↓
Continue same AgentRun / Work Session
```

The previous provider's raw message objects, hidden reasoning metadata, cache identifiers and native conversation handles MUST NOT be required to continue the new epoch.

## 1.3 Structured tool flow

```text
Provider-native tool signal
  ↓ adapter normalize
Canonical ToolCallRequested
  ↓ Protocol Guard
validate tool name + schema + call id + runtime capability
  ↓ PermissionService
ALLOW / ASK / DENY
  ↓
ToolExecutor
  ↓
Canonical ToolCallCompleted or ToolCallFailed
  ↓
Context Compiler projects ToolResult back to current runtime
```

If the model writes `Calling read({...})` in normal assistant text, the path stops at AssistantText. It MUST NOT enter Tool Executor.

## 1.4 Data ownership

- WorkSession/Workflow/Task state: relational domain tables.
- Canonical execution history: append-only canonical event table plus transcript/message projections.
- Provider/account/model state: provider tables + vault secret references.
- Files changed: Git/worktree filesystem; metadata in DB.
- Large tool output/artifacts: artifact store, referenced by hash/id from DB.
- UI state: renderer local state only when non-authoritative (selected tab, open inspector, scroll position).
