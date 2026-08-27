---
doc_id: COMP-AGENTRT-001
title: "Agent Runtime"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [agent-runtime, agent-run, worker, stream, loop]
depends_on: [COMP-CONTEXT-001, COMP-EVENT-001, COMP-TOOL-001]
---

# 2.6 Agent Runtime

## Purpose

Executes one AgentRun and converts runtime events into agent progress/outcome. It is intentionally narrower than V1 `BsAgentManager`: it does not schedule the whole project, choose arbitrary workers or own provider account state.

## Core interface

```ts
interface WorkerRuntime {
  execute(input: AgentRunInput): AsyncIterable<CanonicalRuntimeEvent>
  cancel(reason: string): Promise<void>
}
```

`AgentRunInput` contains immutable AgentVersion, TaskEnvelope, RuntimeTarget, compiled context handle, tool manifest, permission profile, limits and correlation IDs.

## Model runtime vs native agent runtime

V2 supports both through the same WorkerRuntime boundary:

- **Model Runtime:** BS Coding owns the loop and Tool Executor; provider model emits structured tool calls.
- **Native Agent Runtime:** Codex/Claude Code/Aider/custom CLI may own a richer internal loop. The adapter MUST still emit canonical progress/events, artifacts and final status. It MUST NOT be nested inside a second model “coding loop” that tries to reinterpret its terminal output as tools.

## Step limits and cancellation

AgentRun has max steps/time/budget limits. Cancellation must propagate to provider streams, PTY processes and running tools. Tool operations that are not safely interruptible MUST report cancellation pending until a safe boundary.

## Outcome contract

AgentRun ends with one of `SUCCEEDED | FAILED | BLOCKED | CANCELLED | DEGRADED`. Success means the assignment produced the required result/artifacts; it does NOT mean the parent Task or Work Session automatically passed quality gates.

## Reuse from V1

The testable dependency-injected loop concept from V1 is worth preserving. Tool-output truncation, steering at step boundaries and no-real-model unit tests SHOULD also be retained, but rewritten against canonical event/context interfaces.
