---
doc_id: INDEX-000
title: "BS Coding V2.0.0 Architecture Documentation Index"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "index"
keywords: [index, toc, ai-coder, v2]
depends_on: []
---

# BS Coding V2.0.0 — Architecture Documentation Pack

> **Purpose:** authoritative technical design package for rebuilding/upgrading BS Coding to **V2.0.0** and implementing the approved UX prototype.
>
> **Approved UX prototype:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1
>
> **Current codebase baseline:** https://github.com/tuannm711/BS-Coding — observed package version **1.3.1** at the time this specification was prepared.

## How AI Coder MUST use this documentation

1. Start with this file and `01-overall/01-architecture-overview.md`.
2. Before changing a subsystem, read its component document in `02-components/` **and every document named in `depends_on`**.
3. Search by stable requirement/component IDs such as `ARCH-`, `COMP-`, `STATE-`, `CONTRACT-`, `MIG-`, `TEST-`, `NFR-`, `AC-` rather than relying only on headings.
4. Treat the Figma Make prototype as the **UX behavior contract**, not as production source code.
5. Treat this V2 architecture pack as the **target technical contract**.
6. For facts about V1.3.1 implementation, source code wins over older design prose. Existing V1 docs are background only when they conflict with code.
7. Never silently resolve a conflict between V2 architecture and prototype behavior. Use the conflict rules below.

## Authority / conflict rules

| Question | Authority |
|---|---|
| Target V2 backend architecture/invariants | This documentation pack |
| Target V2 user-visible behavior/layout | Approved Figma Make prototype |
| Current V1 implementation fact | Current repository source code |
| Existing V1 design/technical-debt documents | Context only; validate against source |
| Security invariant | This pack; stricter rule wins |

If a prototype interaction cannot be implemented without breaking a stated architecture/security invariant, stop and raise the mismatch rather than weakening the invariant.

## Document map

### 1. Mô tả tổng thể

| ID | File | Purpose |
|---|---|---|
| `ARCH-OVR-001` | [01-overall/01-architecture-overview.md](01-overall/01-architecture-overview.md) | Target architecture, boundaries, layers |
| `ARCH-PRIN-001` | [01-overall/02-principles-and-target-state.md](01-overall/02-principles-and-target-state.md) | Design principles and locked decisions |
| `ARCH-FLOW-001` | [01-overall/03-system-context-and-data-flow.md](01-overall/03-system-context-and-data-flow.md) | End-to-end runtime/data flow |

### 2. Mô tả chi tiết từng thành phần

| ID | File | Component |
|---|---|---|
| `COMP-DOMAIN-001` | [02-components/01-domain-model.md](02-components/01-domain-model.md) | Domain model and ownership |
| `COMP-EVENT-001` | [02-components/02-canonical-event-protocol.md](02-components/02-canonical-event-protocol.md) | Canonical runtime + durable event protocol |
| `COMP-SESSION-001` | [02-components/03-work-session-runtime-epoch.md](02-components/03-work-session-runtime-epoch.md) | Work Session, Workflow Run, Runtime Epoch |
| `COMP-PROVIDER-001` | [02-components/04-provider-account-model-routing.md](02-components/04-provider-account-model-routing.md) | Providers, accounts, models, routing |
| `COMP-CONTEXT-001` | [02-components/05-context-compiler.md](02-components/05-context-compiler.md) | Context compilation and model switching |
| `COMP-AGENTRT-001` | [02-components/06-agent-runtime.md](02-components/06-agent-runtime.md) | Native agent runtime and execution loop |
| `COMP-TOOL-001` | [02-components/07-tool-execution-protocol-guard.md](02-components/07-tool-execution-protocol-guard.md) | Tool execution, permission, protocol guard |
| `COMP-WF-001` | [02-components/08-workflow-task-graph-engine.md](02-components/08-workflow-task-graph-engine.md) | Deterministic workflow/DAG engine |
| `COMP-TEAM-001` | [02-components/09-agent-team-orchestrator.md](02-components/09-agent-team-orchestrator.md) | Agent definitions, roles, orchestrator |
| `COMP-WS-001` | [02-components/10-workspace-git-isolation.md](02-components/10-workspace-git-isolation.md) | Workspace, Git, worktrees, integration |
| `COMP-QUALITY-001` | [02-components/11-review-quality-gates.md](02-components/11-review-quality-gates.md) | Review/rework/final verification |
| `COMP-DATA-001` | [02-components/12-persistence-audit-event-store.md](02-components/12-persistence-audit-event-store.md) | SQLite, event store, artifacts, projections |
| `COMP-EXT-001` | [02-components/13-skills-mcp-lsp.md](02-components/13-skills-mcp-lsp.md) | Skills, MCP, LSP extensibility |
| `COMP-UI-001` | [02-components/14-ui-application-binding.md](02-components/14-ui-application-binding.md) | Electron/IPC/UI binding to prototype |
| `COMP-SEC-001` | [02-components/15-security-permissions-secrets.md](02-components/15-security-permissions-secrets.md) | Security, permissions, secrets |
| `COMP-OBS-001` | [02-components/16-observability-usage-budget.md](02-components/16-observability-usage-budget.md) | Logs, usage, costs, budgets |
| `COMP-REMOTE-001` | [02-components/17-updates-remote-control.md](02-components/17-updates-remote-control.md) | Updates and optional remote control |

### 3. Các mô tả khác

| ID | File | Purpose |
|---|---|---|
| `STATE-001` | [03-other/01-state-machines.md](03-other/01-state-machines.md) | Canonical lifecycle/state machines |
| `CONTRACT-001` | [03-other/02-api-ipc-contracts.md](03-other/02-api-ipc-contracts.md) | Main/preload/renderer contracts |
| `ERR-001` | [03-other/03-error-recovery.md](03-other/03-error-recovery.md) | Failure classes and recovery |
| `TEST-001` | [03-other/04-testing-strategy.md](03-other/04-testing-strategy.md) | Test strategy and contract corpus |
| `MIG-001` | [03-other/05-migration-v1.3.1-to-v2.0.0.md](03-other/05-migration-v1.3.1-to-v2.0.0.md) | Clean rebuild + data migration |
| `NFR-001` | [03-other/06-nonfunctional-requirements.md](03-other/06-nonfunctional-requirements.md) | Performance, reliability, security, maintainability |
| `RULE-001` | [03-other/07-coding-rules-and-boundaries.md](03-other/07-coding-rules-and-boundaries.md) | Module boundaries and coding rules |
| `AC-001` | [03-other/08-acceptance-criteria.md](03-other/08-acceptance-criteria.md) | V2 architecture acceptance gates |
| `HANDOFF-001` | [03-other/09-ai-coder-handoff-guide.md](03-other/09-ai-coder-handoff-guide.md) | How AI Coder should execute against this pack |
| `GLOSS-001` | [03-other/10-glossary.md](03-other/10-glossary.md) | Canonical terminology |
| `TRACE-001` | [03-other/11-requirement-traceability.md](03-other/11-requirement-traceability.md) | Prototype/problem → component mapping |
| `SCOPE-001` | [03-other/12-non-goals-and-deferred.md](03-other/12-non-goals-and-deferred.md) | Non-goals and intentionally deferred work |

## Retrieval conventions

Every normative statement uses **MUST / MUST NOT / SHOULD / MAY**. Component documents include search keywords and stable IDs. AI Coder should quote the relevant ID in commits, PR descriptions, implementation notes, and tests where practical.

## Target high-level dependency order

```text
Domain Model
  ↓
Canonical Event Protocol
  ↓
Persistence / Event Store
  ↓
Provider + Runtime Adapter Boundary
  ↓
Context Compiler + Runtime Epoch
  ↓
Tool Executor + Protocol Guard
  ↓
Agent Runtime
  ↓
Workflow / Task Graph Engine
  ↓
Team / Orchestrator / Workspace Isolation
  ↓
Review + Quality Gates
  ↓
IPC / UI Projections
  ↓
Migration / Cutover / V2.0.0 Release
```

This is a dependency map, **not** a detailed implementation plan. The implementation plan should be generated only after this architecture specification is reviewed and approved.
