---
doc_id: ARCH-PRIN-001
title: "Nguyên tắc thiết kế và target state"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "overall"
keywords: [principles, target-state, boundaries, locked-decisions]
depends_on: []
---

# 1. Nguyên tắc thiết kế và Target State

## 1.1 Locked design decisions

| ID | Decision | Rationale |
|---|---|---|
| `ARCH-PRIN-01` | Work Session is the user-facing unit of continuity. | Users continue one piece of work even when runtime/model changes. |
| `ARCH-PRIN-02` | Runtime Epoch is the unit of provider/model/account continuity. | Prevents protocol leakage when switching targets. |
| `ARCH-PRIN-03` | Canonical events are app-owned. | Provider message formats cannot be the persistent contract. |
| `ARCH-PRIN-04` | Provider adapters translate; they do not own workflow state. | Keeps provider differences local. |
| `ARCH-PRIN-05` | Workflow Engine validates and schedules the DAG. | LLM planning is intelligent but not authoritative state. |
| `ARCH-PRIN-06` | Agents are configuration + policy, not subclasses. | Same model can serve many roles; roles remain extensible. |
| `ARCH-PRIN-07` | Account routing is normally invisible to users. | Users choose intent/agent; router chooses healthy capacity. |
| `ARCH-PRIN-08` | AUTO / PREFERRED / PINNED account policy. | Supports automation and explicit control without “one active account.” |
| `ARCH-PRIN-09` | Router is sticky for a Runtime Epoch. | Avoids unnecessary target churn and preserves provenance. |
| `ARCH-PRIN-10` | Narrated tool text is a protocol violation, never a success. | Prevents accidental/prompt-injected execution. |
| `ARCH-PRIN-11` | Quality gates are layered: mechanical + specialist AI + final verification. | A single model cannot certify its own work. |
| `ARCH-PRIN-12` | Project-scoped agents/skills/MCP belong to Project scope, not Global Settings. | Matches approved UX and fixes V1 scope drift. |

## 1.2 Architectural style

V2 SHOULD use a **modular monolith inside Electron main process** rather than microservices. The application is a local desktop product; process isolation is used only where necessary (PTY/native agents/browser extension/optional relay). The modular monolith gives explicit domain boundaries while retaining simple local transactions and deployment.

The preferred dependency direction is:

```text
UI → Application → Domain
                 ↘ Ports ← Infrastructure adapters
```

Domain modules MUST NOT import Electron, React, AI SDK provider packages, node-pty, MCP SDK or database driver APIs.

## 1.3 Reuse vs rebuild

Reuse SHOULD be selective:

- **Reuse/port behind new interfaces:** provider auth logic, provider-specific quota parsing, safeStorage vault, proven individual tools, MCP/LSP protocol code, shell/process handling, Git helpers, syntax highlighting and editor utilities.
- **Rebuild:** transcript/event model, runtime switch semantics, orchestration, agent/task coordination, application state, IPC contracts, Work/Project UI shell.
- **Deprecate/replace:** terminal-pane-centric product model, ad-hoc cross-agent delegation as the primary orchestrator, provider-native transcript persistence, exclusive active-account semantics.

## 1.4 YAGNI boundaries for V2.0.0

V2.0.0 MUST deliver the clean architecture and approved prototype behavior. It SHOULD NOT add distributed cloud orchestration, multi-user collaboration, hosted SaaS accounts, recursive autonomous organizations of agents, or marketplace billing. Extension points may exist, but implementation is deferred unless required by the prototype or migration.
