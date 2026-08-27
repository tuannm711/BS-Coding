---
doc_id: COMP-CONTEXT-001
title: "Context Compiler"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [context, compiler, projection, model-switch, token-budget, summary]
depends_on: [COMP-EVENT-001, COMP-SESSION-001, COMP-PROVIDER-001]
---

# 2.5 Context Compiler

## Purpose

Builds the minimum safe, relevant context for an AgentRun/RuntimeEpoch from canonical state. It replaces “replay whatever the previous provider stored”.

## Inputs

- TaskEnvelope / goal / acceptance criteria.
- AgentVersion system instructions, skills, permissions, role policy.
- Project instructions and selected files/context snapshots.
- Relevant canonical messages.
- Structured ToolCall/ToolResult history when representable.
- Plan/task/workflow state and artifacts.
- Target model capability/context budget.

## Outputs

`CompiledContext` is provider-neutral structured data plus a target-specific projection created by the adapter. Context Compiler itself MUST NOT import provider SDK message types.

## Context selection policy

Prioritize in this order:

1. system/security/permission rules;
2. current task objective + acceptance criteria + dependencies;
3. current plan/workflow state;
4. project instructions and necessary source context;
5. recent conversation messages;
6. tool execution results/artifacts relevant to current task;
7. summaries of older history.

Large output MUST be referenced by artifact id with a concise preview rather than copied repeatedly.

## Cross-runtime normalization

If target runtime safely supports structured historical tool calls, the adapter MAY project canonical ToolCall/ToolResult into its native structured form. If it cannot, the compiler MUST produce a neutral factual execution-history block clearly framed as past record, not as assistant-call syntax.

Provider-specific thought signatures, cache IDs, hidden reasoning and native session IDs MUST be omitted from cross-epoch context unless required only inside the same epoch.

## Token budget and compaction

Compaction SHOULD be incremental and artifact-aware. The compiler MUST be able to rebuild context from durable canonical state after restart. A provider context-length rejection SHOULD trigger one reduced-context retry policy before failing/switching runtime.
