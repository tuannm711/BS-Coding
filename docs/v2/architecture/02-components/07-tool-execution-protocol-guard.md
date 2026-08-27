---
doc_id: COMP-TOOL-001
title: "Tool Executor và Protocol Guard"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [tools, protocol-guard, permission, mcp, schema, narrated-tool]
depends_on: [COMP-EVENT-001, COMP-SEC-001]
---

# 2.7 Tool Executor và Protocol Guard

## Purpose

Guarantees that only explicit structured calls are executed and that every tool action is schema-validated, permission-checked, auditable and cancellable.

## Pipeline

```text
Canonical ToolCallRequested
  ↓ Tool Protocol Guard
  ↓ Tool Registry lookup
  ↓ Zod/JSON-schema argument validation
  ↓ Capability + duplicate-call checks
  ↓ Permission Service
  ↓ Tool Executor
  ↓ output truncation/artifact store
  ↓ Canonical ToolResult
```

## Protocol violations

Examples:

- model describes `read({path: ...})` in assistant prose;
- unknown tool name;
- malformed arguments;
- duplicate call id;
- result without call;
- provider emits a tool-shaped event while model capability is text-only.

Narrated tool text MUST generate no execution. The runtime MAY retry with a corrective instruction such as “Use the provided structured tool interface; do not describe the call.” A second failure MAY mark runtime capability degraded and offer runtime switch/text-only mode.

## Tool definition

Tools remain plain definitions (`name`, description, schema, execute). Each tool MUST also declare `permissionCategory`, `sideEffectLevel`, `supportsCancellation`, `outputPolicy` and optional `workspaceRequirement`.

## Permissions

Decision: `ALLOW | ASK | DENY`. Policy resolution order:

1. hard security deny;
2. WorkSession temporary approvals/denials;
3. AgentVersion permission profile;
4. Project override;
5. Global default.

A lower scope MUST NOT override a hard security deny.

## Tool families

Built-in filesystem, edit/write, shell, Git, browser/web, office, LSP and MCP tools all join the same executor boundary. MCP transport is not permission bypass.
