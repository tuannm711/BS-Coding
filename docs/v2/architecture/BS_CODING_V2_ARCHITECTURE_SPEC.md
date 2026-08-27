# BS Coding V2.0.0 — Consolidated Architecture Specification

> Generated from the modular documentation pack. Prefer modular files for AI retrieval; this file is provided for single-file handoff.


---

<!-- SOURCE: 01-overall/01-architecture-overview.md -->

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


---

<!-- SOURCE: 01-overall/02-principles-and-target-state.md -->

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


---

<!-- SOURCE: 01-overall/03-system-context-and-data-flow.md -->

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


---

<!-- SOURCE: 02-components/01-domain-model.md -->

# 2.1 Domain Model

## Purpose

Defines the canonical entities and ownership boundaries used by every V2 module. IDs MUST be opaque UUID/ULID-style application identifiers; UI display names/codes MUST NOT be used as relational keys.

## Aggregate roots

### Project
Owns project-scoped configuration and references a real repository/workspace.

Minimum fields: `id`, `name`, `repoPath`, `defaultBranch`, `instructionsRef`, `createdAt`, `updatedAt`, `archivedAt`.

Project owns references to AgentDefinitions, project Skills, MCP configurations and default Work policies.

### WorkSession
User-facing long-lived container for one goal/initiative. Fields: `id`, `projectId`, `title`, `goal`, `status`, `activeWorkflowRunId`, `createdAt`, `updatedAt`, `completedAt`, `cancelledAt`.

A WorkSession MAY contain multiple WorkflowRuns over its lifetime, e.g. `Resume as New Run` after cancellation.

### WorkflowRun
Deterministic execution instance inside a WorkSession. Owns PlanVersion selection, Task graph state, scheduler state, budget counters and quality-gate state.

### Task / TaskRun
`Task` is the logical plan node. `TaskRun` is an execution attempt. Rework MUST create a new Task or new run according to policy while preserving provenance to the failed finding/task.

### AgentDefinition / AgentVersion
AgentDefinition is stable identity; AgentVersion is immutable configuration snapshot used for an AgentRun. Running work MUST reference an AgentVersion, not mutable live settings.

### AgentRun
One agent executing one assignment. Owns RuntimeEpochs and a canonical conversation/event stream. The same AgentRun may cross runtime targets through multiple RuntimeEpochs.

### RuntimeEpoch
Immutable runtime-target segment: provider/account/model/native-runtime + start/end + reason. See `COMP-SESSION-001`.

### Review / Finding / QualityGate
Review records the reviewer and scope. Finding has severity/status/evidence. QualityGate combines deterministic checks or review conditions into a pass/fail/blocked decision.

### Artifact / ChangeSet
Artifact is immutable output reference; ChangeSet captures Git diff/worktree/commit provenance.

## Relationship sketch

```text
Project
 ├─ AgentDefinition ─ AgentVersion
 ├─ SkillBinding
 ├─ MCPBinding
 └─ WorkSession
     └─ WorkflowRun
         ├─ PlanVersion
         ├─ Task ─ TaskDependency
         │   └─ TaskRun
         │       └─ AgentRun
         │           └─ RuntimeEpoch
         │               └─ CanonicalEvent*
         ├─ Artifact*
         ├─ Review* ─ Finding*
         └─ QualityGate*
```

## Ownership rules

- `[COMP-DOMAIN-R01]` Task status is owned by Workflow Engine; agents report outcomes only.
- `[COMP-DOMAIN-R02]` AgentDefinition changes MUST NOT mutate already-running AgentVersion snapshots.
- `[COMP-DOMAIN-R03]` Provider accounts are global resources; Agent runtime policy references them by routing policy rather than copying credentials.
- `[COMP-DOMAIN-R04]` WorkSession state is derived from active WorkflowRun and quality gates, not from chat text.
- `[COMP-DOMAIN-R05]` Every execution/audit record MUST carry correlation IDs sufficient to trace Project → WorkSession → WorkflowRun → TaskRun → AgentRun → RuntimeEpoch.


---

<!-- SOURCE: 02-components/02-canonical-event-protocol.md -->

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


---

<!-- SOURCE: 02-components/03-work-session-runtime-epoch.md -->

# 2.3 Work Session, Workflow Run và Runtime Epoch

## Separation of concepts

- **Work Session:** user-visible continuity: “Google OAuth Login”.
- **Workflow Run:** one deterministic execution attempt of the Work Session.
- **Agent Run:** one agent working one assignment.
- **Runtime Epoch:** one continuous runtime target inside an AgentRun.

This separation is mandatory because model/account switching and “Resume as New Run” are different operations.

## Runtime Epoch model

Fields SHOULD include `id`, `agentRunId`, `sequence`, `runtimeType`, `providerId`, `accountId`, `modelId`, `nativeRuntimeId`, `startedAt`, `endedAt`, `endReason`, `capabilitySnapshot`, `usageSummary`, `runtimeContextRef`.

`endReason`: `completed | user-switch | fallback | quota-refusal | capability-degraded | provider-error | cancelled | superseded`.

## Runtime switching

When runtime changes:

1. Stop/finish current step safely.
2. Persist canonical checkpoint and close current epoch.
3. Context Compiler builds target-safe context.
4. Router selects/resolves target account/model.
5. Start a new epoch.
6. Continue same AgentRun unless workflow policy explicitly reassigns the task.

The UI MUST show a runtime-changed event and history for the primary Work Session agent; worker epoch history MAY be shown in task details.

## Pause / Resume / Stop semantics

- **Pause:** Workflow Engine stops dispatching new work and requests active AgentRuns to suspend/cancel at safe execution boundaries. Durable state is preserved. Resume continues the same WorkflowRun.
- **Stop/Cancel:** active work is cancelled, WorkflowRun becomes `CANCELLED`, completed results remain immutable/history-visible.
- **Resume as New Run:** creates a new WorkflowRun from the last approved plan/checkpoint; it does not rewrite the cancelled run.

## Invariants

- `[COMP-SESSION-R01]` Cross-provider/model continuation MUST always cross an epoch boundary.
- `[COMP-SESSION-R02]` Account fallback during a turn also creates a new epoch; “same turn id with invisible account swap” is not allowed in V2.
- `[COMP-SESSION-R03]` Work Session id remains stable across epochs and WorkflowRuns.
- `[COMP-SESSION-R04]` Cancelled/Completed WorkflowRuns are immutable except metadata/annotations.


---

<!-- SOURCE: 02-components/04-provider-account-model-routing.md -->

# 2.4 Provider, Account, Model và Routing

## Scope

This component owns global provider connectivity, provider accounts, model catalogs, capability verification, usage/quota data and runtime-target routing. It does not own Agent role behavior or Workflow state.

## Target contracts

```ts
interface ProviderAdapter {
  definition(): ProviderDefinition
  connect(input: ConnectInput): Promise<ProviderAccount>
  refreshAccount(account: ProviderAccount): Promise<ProviderAccount>
  listModels(account: ProviderAccount): Promise<ModelDescriptor[]>
  createModelRuntime(target: RuntimeTarget): Promise<ModelRuntime>
  createNativeRuntime?(target: RuntimeTarget): Promise<NativeAgentRuntime>
  fetchUsage?(account: ProviderAccount): Promise<ProviderUsage>
  recoverRuntimeContext?(...): Promise<unknown>
}
```

`ModelDescriptor` MUST expose verified/declared capabilities separately: streaming, structured tool calls, parallel tools, tool choice, reasoning, images, structured output, context window and native resume support.

## Account policy

Agent runtime policy supports:

- `AUTO`: router chooses eligible account/target.
- `PREFERRED`: use configured account when healthy, otherwise route automatically.
- `PINNED`: only configured account; fail/block when unavailable unless the user explicitly changes policy.

There is no exclusive provider-level `activeAccountId` in V2.

## Router pipeline

1. Filter by provider/model/runtime compatibility and required capabilities.
2. Exclude disabled, expired, unsupported and pool-spent targets.
3. Apply policy constraints (AUTO/PREFERRED/PINNED).
4. Score eligible targets using **explicitly designed signals**: quota health, cooldown, active load, recent failures, latency, estimated cost/budget and capability health.
5. Select target and make it sticky for the Runtime Epoch.
6. On quota/capacity/provider refusal, close epoch, mark cooldown/pool error, and route again if policy allows.

The router MUST NOT rotate accounts to evade provider limits or terms. It may choose among legitimate enabled accounts for availability/capacity management.

## Quota models

V2 MUST support at least:

- Reset windows: session/weekly/monthly/additional.
- Balance/credit model: remaining balance with no reset time.
- Unknown/silent usage: tracked local usage only, confidence marked unknown.

Routing MUST use per-pool/group state where models share quota.

## Capability probe

A model SHOULD be testable with a safe structured-tool probe. Results are persisted as `VERIFIED | DEGRADED | UNSUPPORTED | UNKNOWN` with timestamp/provider version. A degraded structured-tool model MUST NOT be selected for coding work requiring tools unless explicit text-only mode or user override is active.


---

<!-- SOURCE: 02-components/05-context-compiler.md -->

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


---

<!-- SOURCE: 02-components/06-agent-runtime.md -->

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


---

<!-- SOURCE: 02-components/07-tool-execution-protocol-guard.md -->

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


---

<!-- SOURCE: 02-components/08-workflow-task-graph-engine.md -->

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


---

<!-- SOURCE: 02-components/09-agent-team-orchestrator.md -->

# 2.9 Agent Team và Orchestrator

## Agent definition

Agent is configuration, not a model:

```text
AgentDefinition
├─ Identity / Role
├─ Runtime Policy (provider/model/native runtime)
├─ System Instructions
├─ Skills
├─ Tools / MCP
├─ Permissions
├─ Context Policy
├─ Workspace Policy
├─ Output Contract
├─ Limits / Budget
└─ Fallback Policy
```

Immutable AgentVersion snapshots MUST be created when configuration changes or when a run starts.

## Standard V2 templates

Templates are defaults, not hard-coded classes:

| Template | Default role | Default responsibility |
|---|---|---|
| Orchestrator | Coordinator | planning coordination, assignments, dependency/review coordination |
| Architect | Specialist | architecture, interfaces, dependency design |
| Backend Developer | Worker | backend/data/API implementation |
| Frontend Developer | Worker | UI/client implementation |
| Code Reviewer | Reviewer | correctness, maintainability, architecture compliance |
| Security Reviewer | Reviewer | OWASP/auth/secrets/vulnerability review |
| QA / Tester | Reviewer | test planning/execution/regression/acceptance |
| Integration Agent | Worker/Specialist | merge task outputs, resolve conflicts, integration build/checks |

## Orchestrator restrictions

Orchestrator SHOULD be read-only by default: project read/search, plan/task management and assignment tools. Direct write/edit/bash MUST be denied unless a project explicitly changes policy. The product should make delegation the default rather than relying on a prompt saying “do not code.”

## Assignment envelope

Every worker receives a self-contained TaskEnvelope: objective, scope, acceptance criteria, dependencies, relevant artifacts/context, workspace info and explicit reporting contract. Workers MUST NOT depend on hidden coordinator conversation context.

## Budget controls

Workflow policy SHOULD support per-WorkSession max concurrent agents and optional token/cost/request budget. The system MUST surface projected/actual spend before introducing any hard arbitrary threshold.


---

<!-- SOURCE: 02-components/10-workspace-git-isolation.md -->

# 2.10 Workspace và Git Isolation

## Purpose

Parallel coding tasks must not overwrite one another. Workspace Manager owns where each TaskRun can read/write and how results return to integration.

## Default policy

- Read-only analysis/review MAY use shared project checkout.
- Code-writing TaskRun SHOULD get an isolated Git worktree and task branch.
- The Integration Agent owns merging approved task outputs into the WorkflowRun integration branch.
- Agents MUST NOT create unmanaged worktrees/branches outside Workspace Manager unless explicitly permitted.

## Naming / metadata

Physical names may be sanitized and implementation-defined. Database identity is authoritative. Each TaskRun records `repoPath`, `baseCommit`, `branch`, `worktreePath`, `headCommit`, `changesetId`.

## Conflict handling

Merge conflict is not an implicit agent failure. Workflow Engine creates/marks an integration conflict Task assigned to Integration Agent or user. Conflict resolution must be audited and quality gates rerun for impacted scope.

## Safety

Destructive Git operations, push and branch deletion follow Permission Service. The app MUST preserve a recoverable changeset/snapshot before destructive task rollback.

## Cleanup

Completed/cancelled worktrees are eligible for cleanup only after artifacts/commits are recorded and no active run references them. Cleanup failures are warnings, not data-loss triggers.


---

<!-- SOURCE: 02-components/11-review-quality-gates.md -->

# 2.11 Review, Rework và Quality Gates

## Layers

### Mechanical gates
Examples: typecheck, build, lint, unit/integration tests, dependency/security scanners. Results are deterministic and include command, exit code, duration, artifact/log references.

### Specialist AI reviews
Code Reviewer, Security Reviewer and QA/Tester operate on explicit scope and evidence. A review produces `PASS | PASS_WITH_SUGGESTIONS | FAIL | BLOCKED` plus Findings.

### Final Verification
Final verifier confirms required mechanical gates and mandatory reviews passed for the final integrated changeset. It does not trust worker self-report.

## Finding model

Fields: severity (`INFO|LOW|MEDIUM|HIGH|CRITICAL`), category, description, evidence refs, affected files, reviewer AgentVersion, status (`OPEN|ACCEPTED|FIXED|DISMISSED`), linked rework Task.

## Rework loop

The prototype lifecycle is normative:

```text
Review FAIL
 → create rework Task (e.g. T09)
 → worker fixes
 → mechanical checks rerun
 → failed specialist review rerun
 → PASS
 → Final Verification
 → COMPLETED
```

Only impacted gates MAY be selectively rerun when the gate dependency graph proves others unaffected; otherwise rerun all required final gates.

## Completion invariant

`[COMP-QUALITY-R01]` WorkSession/WorkflowRun cannot become COMPLETED until all blocking gates are PASS and no blocking Finding remains open. No AgentRun success event can bypass this rule.


---

<!-- SOURCE: 02-components/12-persistence-audit-event-store.md -->

# 2.12 Persistence, Audit và Event Store

## Storage strategy

Use a hybrid local persistence model:

1. **SQLite (WAL)** for structured domain state, projections, indexes and durable canonical events.
2. **Filesystem artifact store** for large immutable tool outputs, logs, patches, screenshots and exported artifacts.
3. **Electron safeStorage vault** for secrets/tokens. SQLite stores only secret references/metadata.
4. **Git repositories/worktrees** for source-of-truth code changes.

V2 does NOT require full event sourcing. Relational current-state tables are first-class; append-only canonical events provide audit/replay/provenance.

## Core table groups

- projects / project_settings
- work_sessions / workflow_runs / plans / tasks / task_dependencies / task_runs
- agent_definitions / agent_versions / agent_runs / runtime_epochs
- provider_accounts / model_capabilities / provider_usage / pool_state
- canonical_events / messages / tool_calls / permission_decisions
- artifacts / changesets
- reviews / findings / quality_gates / approvals
- usage_records / budgets
- schema_migrations / import_history

## Event store rules

Events are append-only. Corrections use compensating/new events or mutable projection tables; never rewrite execution history. Large payloads are stored as artifact references.

## Transactions

Domain transition and its durable event MUST commit atomically where possible. Starting a TaskRun, assigning AgentVersion, reserving workspace and emitting lifecycle event SHOULD be one application transaction or a recoverable saga with explicit intermediate state.

## Recovery

On startup the app detects incomplete active runs, marks orphaned runtime processes as interrupted, rehydrates projections, and offers safe resume/retry. No background process is assumed alive after app crash unless explicitly managed by a durable native runtime integration.


---

<!-- SOURCE: 02-components/13-skills-mcp-lsp.md -->

# 2.13 Skills, MCP và LSP

## Skills

Skills are versioned instruction/capability packages. Bindings may be Built-in, Marketplace/imported or Project-scoped. AgentVersion snapshots the exact skill versions used for reproducibility.

A Skill SHOULD contain id/name/version, description, instruction source, optional required tools/MCP capabilities and compatibility metadata. Skills are instructions/policies, not arbitrary hidden code unless explicitly declared as an executable extension.

## MCP

MCP Manager owns server definitions, lifecycle, transport (`stdio`/HTTP), environment references and discovered tools. MCP tools are normalized into Tool Registry and pass through the same permission/protocol/audit pipeline as built-ins.

Environment secrets MUST use vault references; renderer sees masked values.

## LSP

LSP Manager is project/workspace scoped. It MAY expose explicit tools and automatic diagnostics after edits. Diagnostics are canonical artifacts/events and can feed QA/review gates.

## Extension invariant

No skill/MCP/LSP integration may bypass Tool Executor, Permission Service, workspace scope or audit logging.


---

<!-- SOURCE: 02-components/14-ui-application-binding.md -->

# 2.14 UI / Application Binding

## Prototype contract

Approved prototype: https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

The production app MUST reproduce the information architecture and behavior, not the prototype's demo data or component implementation.

Primary navigation is exactly **Home / Projects / Work / Agents / Settings**. `StatesScreen` is development/reference only and MUST NOT be a production navigation item.

## Screen → backend projection mapping

| UI | Primary query/projection | Primary commands |
|---|---|---|
| Home | recent projects, active sessions, attention items, provider health | open project/session |
| Project Overview | active WorkSessions, Git summary, project agents/instructions | create/open session |
| Work Sessions | session list/status/progress | create, rename, archive, duplicate |
| Files/Git | workspace/repo projections | stage/commit/branch actions |
| Project Agents | AgentDefinitions/versions/bindings | add/edit/enable/remove |
| Skills/MCP | project bindings/server status | enable/add/connect/restart |
| Work/Conversation | canonical message/runtime-event projection | send message, switch runtime |
| Work/Plan | PlanVersion + approval | approve/edit/regenerate |
| Work/Tasks | DAG/task projections | inspect/stop/reassign/approve |
| Work/Execution | AgentRun/TaskRun graph | inspect/cancel |
| Work/Changes | ChangeSet/diff | open/revert/review |
| Work/Review | gates/reviews/findings | create rework, approve exception |
| Settings/Providers | provider/account/model/usage | connect/refresh/enable/probe |

## State principle

Renderer MUST NOT synthesize authoritative workflow status by scraping chat events. Main process exposes projections such as `WorkSessionSummary`, `TaskDetail`, `ExecutionGraph`, `ReviewSummary`, `ProviderHealth`.

## Bottom panel

Terminal, Tests, Problems, Logs and Output are separate projections. Their content sources are respectively PTY sessions, test-run artifacts, diagnostics/findings, structured event logs, and workflow/runtime output.


---

<!-- SOURCE: 02-components/15-security-permissions-secrets.md -->

# 2.15 Security, Permissions và Secrets

## Security boundaries

- Renderer is untrusted relative to privileged main-process operations.
- Secrets never cross into renderer in plaintext.
- All IPC commands are validated and authorized.
- Tool execution requires structured call + permission decision.
- Workspace path checks prevent accidental access outside permitted roots unless explicitly approved.

## Secret storage

Use Electron `safeStorage` vault or equivalent OS-protected encryption. DB stores account metadata and vault key/reference, not raw token/API key. Logs/events MUST redact secrets before persistence.

## Permission categories

At minimum: file read, file write/edit, shell, Git read, Git write/push, browser, web/network, MCP tools, office tools, destructive file operations, external process/native agent control.

Global defaults are overridden by Project and Agent policies; hard security denies cannot be overridden by lower-level policy.

## Shell/process safety

Command policy should classify known destructive patterns, but MUST NOT rely solely on regex. Permission is based on tool category + arguments + workspace. Process cancellation uses process-tree termination where needed and records result.

## Prompt-injection boundary

Content from repository, web, MCP, terminal or tool output is data, not trusted instruction. Tool Protocol Guard prevents text content from becoming executable call. Agent system instructions MUST make trust boundaries explicit, but enforcement is code-based.

## Remote control

If enabled, it MUST use pairing, authenticated encrypted channel, revocation and minimal exposed command surface. See `COMP-REMOTE-001`.


---

<!-- SOURCE: 02-components/16-observability-usage-budget.md -->

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


---

<!-- SOURCE: 02-components/17-updates-remote-control.md -->

# 2.17 Updates và Remote Control

## Updates

Retain Electron updater capability. Update service belongs to global application infrastructure, not Project. Support stable/beta channel, check/download/apply status and release notes. Database migrations run before V2 feature use and require backup/rollback policy where destructive.

## Remote Control

Remote Control is optional and disabled by default. It provides remote observation/limited control of a local BS Coding instance through a relay/pairing flow consistent with the prototype.

Required properties:

- short-lived pairing code;
- explicit local enablement;
- authenticated encrypted channel;
- device/session revocation;
- command allowlist;
- no relay-side access to project content when end-to-end encryption is enabled;
- local audit event for connection and every privileged remote command.

Remote control MUST call the same application command services as local UI. It MUST NOT directly access Tool Executor, filesystem or provider secrets.


---

<!-- SOURCE: 03-other/01-state-machines.md -->

# 3.1 State Machines

## WorkflowRun

```text
RECEIVED → ANALYZING → PLANNING → WAITING_APPROVAL → EXECUTING
                                              ↓
EXECUTING → INTEGRATING → REVIEWING → VERIFYING → COMPLETED
                           ↓            ↑
                        REWORKING ───────┘
```

Cross-cutting states: `PAUSED`, `BLOCKED`, `FAILED`, `CANCELLED`. Resume from PAUSED returns to the prior active phase. CANCELLED/COMPLETED are terminal.

## TaskRun

```text
QUEUED → READY → RUNNING → COMPLETED
   ↓       ↓       ├→ WAITING_APPROVAL
 BLOCKED   │       ├→ FAILED
           │       ├→ CANCELLED
           │       └→ REVIEW_FAILED → REWORK
```

A logical Task can have multiple TaskRuns/attempts. The graph node's final state is derived from accepted successful run + required review state.

## AgentRun

`CREATED → STARTING → RUNNING → SUCCEEDED | FAILED | BLOCKED | CANCELLED | DEGRADED`.

## RuntimeEpoch

`STARTING → ACTIVE → CLOSING → CLOSED`. Epoch is never resumed after CLOSED; a new epoch is created.

## WorkSession

User-facing state: `PLANNING | EXECUTING | PAUSED | REVIEW | REWORK | VERIFYING | COMPLETED | CANCELLED | FAILED | BLOCKED`. It is a projection of active WorkflowRun, not separately hand-edited.

## Transition rule

All transitions MUST be implemented as named domain commands/events and validated centrally. UI components, provider adapters and agents MUST NOT set arbitrary status strings.


---

<!-- SOURCE: 03-other/02-api-ipc-contracts.md -->

# 3.2 API / IPC Contracts

## Goal

Replace a large collection of ad-hoc IPC channels with namespaced, typed contracts while keeping Electron security boundaries.

## Contract families

```text
project.*
workSession.*
workflow.*
task.*
agent.*
provider.*
workspace.*
git.*
skill.*
mcp.*
settings.*
diagnostics.*
remote.*
```

Use command/query/subscription semantics:

```ts
project.get(id) -> ProjectDetail
workSession.create(input) -> WorkSessionDetail
workSession.pause(id) -> CommandResult
workSession.switchRuntime(input) -> RuntimeEpochSummary
workflow.subscribe(runId) -> ProjectionEvent
provider.listAccounts() -> ProviderSummary[]
```

## Rules

- Every input/output schema MUST be explicit and runtime-validated (Zod or equivalent).
- Preload exposes a minimal typed API under one namespace such as `window.bs`.
- Renderer MUST NOT receive raw filesystem handles, tokens, provider clients or Node process objects.
- Subscription events MUST include monotonic revision/sequence so renderer can detect gaps and refetch projection.
- Commands MUST be idempotent where practical or carry request id/idempotency key for consequential operations.

## Internal application ports

Application services depend on ports (`ProviderPort`, `RuntimePort`, `WorkspacePort`, `EventStore`, `ArtifactStore`, `Clock`, `IdGenerator`) so tests can use deterministic fakes.


---

<!-- SOURCE: 03-other/03-error-recovery.md -->

# 3.3 Error Handling và Recovery

## Error classes

| Class | Examples | Default response |
|---|---|---|
| User/action | permission denied, invalid config | show actionable error, no retry loop |
| Provider auth | expired/revoked token | refresh/reconnect, then block target |
| Quota/capacity | 429, pool exhausted | close epoch, cooldown, route if policy allows |
| Protocol | narrated tool call, malformed tool schema | corrective retry once, degrade/switch |
| Context | context length exceeded | recompile smaller context once, then switch/fail |
| Tool | command exit nonzero, MCP error | return structured result; workflow decides retry/rework |
| Workspace/Git | conflict, dirty base, worktree failure | block task/integration; preserve evidence |
| Quality | test/review failure | rework loop, not infrastructure retry |
| Process/app | crash/restart | mark orphaned runs interrupted; recover from durable state |

## Retry policy

Retries MUST be bounded and reason-specific. Exponential retry is appropriate for transient network errors, not code/test failures. Every retry attempt is auditable and counts against configured budget.

## Protocol violation recovery

1. record `protocol.violation`;
2. do not execute prose;
3. corrective structured-tool retry when supported;
4. if repeated, mark capability degraded for runtime epoch/model probe confidence;
5. offer/perform runtime switch if policy permits;
6. text-only mode disables coding execution tools visibly.

## Crash recovery

At startup scan non-terminal WorkflowRuns/AgentRuns. If underlying process cannot be proven alive, close runtime epoch as interrupted and set task/run to recoverable blocked/interrupted state. Never assume “still running in background” without a managed durable runtime mechanism.


---

<!-- SOURCE: 03-other/04-testing-strategy.md -->

# 3.4 Testing Strategy

## Test pyramid

### Unit
Domain state machines, DAG validation, router scoring, context selection, permission resolution, protocol guard, event schema/migrations, artifact policies.

### Contract
Each ProviderAdapter and NativeRuntimeAdapter runs against a deterministic recorded/fake transport. Contract tests verify canonical event mapping, structured tool calls, usage parsing, auth error classification and capability probe semantics.

### Workflow integration
Run complete WorkSession scenarios with fake model/runtime streams and real in-memory/temp SQLite + temp Git repositories. No real model calls in normal automated test suite.

### E2E
Playwright/Electron flows matching prototype: create project/session, approve plan, tasks execution projection, switch runtime, pause/resume/stop, provider account management, review→rework→final verification.

## Mandatory regression scenarios

- `[TEST-REG-01]` Model A uses tools, switch to Model B, B receives normalized canonical context and performs structured tool call; narrated call text is never executed.
- `[TEST-REG-02]` Same-model account fallback closes old epoch and creates new epoch while preserving WorkSession continuity.
- `[TEST-REG-03]` Duplicate ToolCall id executes at most once.
- `[TEST-REG-04]` Worker success cannot mark WorkflowRun completed while security gate fails.
- `[TEST-REG-05]` Pause stops new dispatch; resume continues same run; cancel preserves completed artifacts.
- `[TEST-REG-06]` Parallel write tasks use isolated worktrees and integrate deterministically.
- `[TEST-REG-07]` Renderer cannot retrieve secrets through preload/API.
- `[TEST-REG-08]` V1 migration is idempotent and preserves backup.

## Replay corpus

Maintain recorded canonical/native protocol fixtures for OpenAI/Codex, Anthropic/Claude, Google/Gemini, Copilot, OpenAI-compatible and native CLI adapters. Every provider adapter change replays the corpus.

## Verification commands

Before release/merge: typecheck, unit/integration test suite, E2E core flow, migration dry run and production Electron build for supported platforms.


---

<!-- SOURCE: 03-other/05-migration-v1.3.1-to-v2.0.0.md -->

# 3.5 Migration V1.3.1 → V2.0.0

## Strategy

V2 is a clean core rebuild with explicit migration, not a long chain of patches inside the V1 runtime. Build V2 modules alongside legacy code behind a versioned cutover boundary until core acceptance gates pass.

## Source baseline observations

V1.3.1 already has useful provider adapters, safeStorage vault, tool registry/permissions, MCP/LSP, structured transcript tool-call/tool-result support, native agent runtime, multi-agent delegation and quota tracking. These are migration inputs, not target boundaries.

Known V1 constraints addressed by V2 include reactive rather than designed proactive routing, incomplete quota models/providers, agent bindings in wrong UI scope, coordinator quota budget gap, and legacy runtime/coordinator abstractions.

## Data migration

1. Create pre-migration backup of V1 app data and configuration.
2. Initialize V2 schema with `schema_migrations` and `import_history`.
3. Import projects and paths.
4. Import provider account metadata while keeping/referencing existing vault secrets where compatible.
5. Convert project agent configurations to AgentDefinition + immutable AgentVersion.
6. Convert compatible session/transcript history to canonical messages/tool events. Unsupported provider-native metadata is discarded, never fabricated.
7. Import usage/quota snapshots as historical records with source/confidence.
8. Mark legacy Fleet/coordination sessions as historical WorkSessions when mapping is unambiguous; otherwise retain read-only legacy archive.
9. Validate counts/hash/sample records.
10. Record migration version and allow idempotent rerun without duplication.

## Cutover rules

- Do not run V1 and V2 writers against the same mutable session store after cutover.
- Keep V1 data backup/read-only rollback path through at least the first V2 release cycle.
- Feature-by-feature adapter reuse is allowed, but new WorkSessions after cutover use only V2 domain/event model.

## Documentation drift rule

When migrating behavior, verify against current source, not older design sentences. Where V1 docs and source disagree, source is the factual baseline; this V2 pack defines the target.


---

<!-- SOURCE: 03-other/06-nonfunctional-requirements.md -->

# 3.6 Non-Functional Requirements

## Reliability

- Durable command transitions survive renderer reload and normal app restart.
- No successful tool execution may be lost from audit history after its completion event is acknowledged.
- App crash must not corrupt SQLite; WAL and transactional migrations required.
- Provider/runtime outage must not corrupt Workflow/Task state.

## Performance

- UI projections for active WorkSession SHOULD update within 250 ms of main-process event under normal local load.
- Streaming text/tool events SHOULD appear progressively without waiting for task completion.
- Project file indexing/search must be incremental; opening a project must not require loading every file into memory.
- Large artifacts/tool logs should be paged/streamed, not inserted into renderer state wholesale.

## Security

- contextIsolation enabled; nodeIntegration disabled.
- secrets encrypted at rest and never rendered plaintext unless an explicit credential entry flow requires transient input.
- all privileged IPC inputs runtime-validated.
- narrated tool text never executable.

## Maintainability

- Domain modules should be small enough for focused AI coding/review; avoid “god manager” files.
- Interfaces and schemas live close to owning modules and have contract tests.
- Generated provider catalogs/data may be large but must be separated from behavior.
- Architecture IDs from this pack SHOULD be referenced in module docs/tests for traceability.

## Portability

Windows is a first-class target. Path/process/worktree behavior must be tested on Windows. macOS/Linux SHOULD remain supported where existing Electron packaging supports them.


---

<!-- SOURCE: 03-other/07-coding-rules-and-boundaries.md -->

# 3.7 Coding Rules và Module Boundaries

## Proposed V2 package/module shape

```text
src/main/v2/
  application/
  domain/
    project/
    work-session/
    workflow/
    task/
    agent/
    review/
  runtime/
    canonical/
    context/
    agent/
    tools/
    providers/
    routing/
  infrastructure/
    persistence/
    artifacts/
    git/
    processes/
    vault/
    mcp/
    lsp/
  ipc/

src/shared/v2/
  contracts/
  schemas/
  dto/

src/renderer/src/v2/
  app/
  screens/
  features/
  components/
  state/
```

Exact paths MAY change, but dependency direction MUST remain.

## Rules

- Domain code imports only domain/shared primitives.
- Infrastructure implements domain/application ports; domain never imports infrastructure.
- Provider-specific code lives under adapter packages and cannot leak SDK types into shared/domain contracts.
- UI never imports main-process implementation modules.
- Zod schemas used at external boundaries; internal domain functions use typed objects and explicit invariants.
- Avoid files that mix orchestration, provider auth, persistence and UI mapping.
- One module should answer one responsibility and be independently unit-testable.
- Every state transition is a named function/command with tests.
- Do not parse log/prose strings to recover business state when a structured field can exist.

## Legacy coexistence

New V2 code should not gradually import legacy `BsAgentManager` as a central dependency. Legacy adapters MAY be wrapped at the edge temporarily. A compatibility adapter must have a deletion/cutover criterion documented in migration notes.


---

<!-- SOURCE: 03-other/08-acceptance-criteria.md -->

# 3.8 Architecture Acceptance Criteria for V2.0.0

V2 architecture is implementation-complete only when all blocking criteria pass.

## Core

- `AC-CORE-01` Approved prototype primary flows are available without terminal/chat-pane-centric navigation.
- `AC-CORE-02` WorkSession/Workflow/Task/Agent/RuntimeEpoch entities persist and recover after restart.
- `AC-CORE-03` Workflow state is deterministic and testable without a real model.

## Runtime portability

- `AC-RUN-01` Switch provider/model/account starts a new RuntimeEpoch and continues same WorkSession.
- `AC-RUN-02` Canonical context can be reconstructed after app restart without provider-native conversation objects.
- `AC-RUN-03` Narrated tool text is never executed; protocol violation/retry/degraded UX works.

## Providers/routing

- `AC-PROV-01` Multiple enabled accounts can coexist; AUTO/PREFERRED/PINNED behave as specified.
- `AC-PROV-02` Router is sticky per epoch and handles cooldown/quota refusal by epoch handoff.
- `AC-PROV-03` Capability probe prevents unsupported/degraded tool runtimes from silently performing coding work.

## Workflow/team

- `AC-WF-01` Parallel independent tasks execute with validated dependencies.
- `AC-WF-02` Parallel write tasks are isolated in worktrees.
- `AC-WF-03` Orchestrator cannot write code with default permissions.
- `AC-WF-04` Review failure creates rework and gates rerun before completion.

## Security/data

- `AC-SEC-01` Secrets remain outside renderer and are redacted from logs/events.
- `AC-SEC-02` MCP/native runtime paths cannot bypass permission/audit boundary.
- `AC-DATA-01` V1 migration is backup-first and idempotent.

## UX/prototype

- `AC-UX-01` Main nav: Home, Projects, Work, Agents, Settings only.
- `AC-UX-02` Work tabs: Conversation, Plan, Tasks, Execution, Changes, Review.
- `AC-UX-03` Pause/Resume/Stop/Cancelled/Resume-as-New-Run semantics match prototype.
- `AC-UX-04` Review demo states map to real backend states, not hard-coded UI-only strings.


---

<!-- SOURCE: 03-other/09-ai-coder-handoff-guide.md -->

# 3.9 Hướng dẫn bàn giao cho AI Coder

## Input bundle

AI Coder should receive:

1. This documentation pack.
2. Approved Figma Make prototype: https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1
3. Current repository: https://github.com/tuannm711/BS-Coding
4. Access to run tests/build in the actual repository environment.

## Mandatory reading order

1. `README.md`
2. all files in `01-overall/`
3. `COMP-DOMAIN-001`, `COMP-EVENT-001`, `COMP-SESSION-001`
4. component document for the implementation slice
5. `STATE-001`, `CONTRACT-001`, `TEST-001`, `MIG-001`, `AC-001`

## Before implementing a slice

AI Coder MUST produce a short impact note containing:

- architecture IDs implemented;
- current V1 files measured/read;
- target V2 modules/files;
- schema/API changes;
- migration implications;
- tests that will prove the slice.

Do not implement from summaries of V1 behavior without reading the relevant current source.

## Prototype usage

Use the prototype to verify navigation, hierarchy, states, interaction and user-visible wording patterns. Do not use the prototype's mock model names, fake quotas, fake files or React component code as business logic.

## Conflict protocol

When target architecture and current V1 source differ, V2 architecture wins for new code and migration must adapt V1 data. When prototype and architecture disagree only on visual composition, prototype wins. When prototype asks for behavior that violates an architecture/security invariant, stop and report the conflict.

## Completion evidence expected from AI Coder

For each slice: changed-file list, architecture IDs covered, tests added/updated, commands run with results, migration notes, screenshots for changed UX, and unresolved risks/debt. “Implemented” without verification evidence is insufficient.

## Not an implementation plan

This pack is the design specification. After human review/approval, create a separate phased implementation plan that decomposes V2 into reviewable milestones and migration checkpoints.


---

<!-- SOURCE: 03-other/10-glossary.md -->

# 3.10 Glossary

| Term | Canonical meaning in V2 |
|---|---|
| Project | Repository/workspace + project-scoped AI configuration |
| Work Session | User-facing continuous unit of work/goal |
| Workflow Run | One deterministic execution attempt inside a Work Session |
| PlanVersion | Immutable approved/proposed plan snapshot |
| Task | Logical DAG node |
| TaskRun | One execution attempt of a Task |
| AgentDefinition | User/project agent identity and editable configuration |
| AgentVersion | Immutable agent configuration snapshot used by a run |
| AgentRun | One agent executing one assignment |
| Runtime Target | Resolved provider/account/model or native runtime |
| Runtime Epoch | Continuous segment using one Runtime Target |
| Provider | Service/integration family such as OpenAI/Anthropic/Google |
| Provider Account | One connected credential/account under a Provider |
| Model | Model descriptor/capabilities exposed by provider |
| Native Agent Runtime | External/native coding agent process such as Codex/Claude Code CLI runtime |
| Canonical Event | App-owned provider-neutral structured event |
| Context Compiler | Builds relevant provider-neutral context and target projection inputs |
| Protocol Guard | Validates canonical structured tool protocol before execution |
| Tool Executor | Permissioned executor of built-in/MCP tools |
| Artifact | Immutable large output/log/file reference |
| ChangeSet | Git/workspace code-change provenance |
| Review | Structured assessment by reviewer/mechanical system |
| Finding | One review issue with severity/evidence/status |
| Quality Gate | Condition that must pass to advance/complete workflow |
| Rework | Work created to resolve failed review/finding |
| Projection | Read model optimized for UI/query, derived from authoritative domain state/events |


---

<!-- SOURCE: 03-other/11-requirement-traceability.md -->

# 3.11 Requirement Traceability

## Original major problems → architecture

| Problem / decision | Target components |
|---|---|
| Switching model causes narrated tool calls | `COMP-EVENT-001`, `COMP-CONTEXT-001`, `COMP-TOOL-001`, `COMP-SESSION-001` |
| Same Work Session should continue after model switch | `COMP-SESSION-001`, `COMP-CONTEXT-001` |
| UI was terminal/chat-centric and hard to use | `ARCH-OVR-001`, `COMP-UI-001`, `COMP-WF-001` |
| Multi-agent should be task/workflow-oriented, not tiled chat matrix | `COMP-WF-001`, `COMP-TEAM-001`, `COMP-UI-001` |
| Provider/account/model hierarchy and multi-account routing | `COMP-PROVIDER-001` |
| Project-scoped Agents/Skills/MCP | `COMP-TEAM-001`, `COMP-EXT-001`, `COMP-UI-001` |
| Review/rework/final verification | `COMP-QUALITY-001`, `STATE-001` |
| Pause/Resume/Stop lifecycle | `COMP-SESSION-001`, `STATE-001` |

## Prototype screens → component ownership

| Prototype area | Components |
|---|---|
| Home | UI projections + WorkSession/Provider summaries |
| Project Overview/Work Sessions | Project + WorkSession + Workflow |
| Files/Git | Workspace/Git |
| Agents | Agent Team + Provider routing policy |
| Skills/MCP | Extensions + Tool platform |
| Work Conversation | Canonical Events + Runtime Epoch + Context Compiler |
| Work Plan/Tasks/Execution | Workflow Engine + Agent Team |
| Work Changes | ChangeSet + Workspace/Git |
| Work Review | Quality Gates + Review/Finding/Rework |
| Settings/Providers | Provider/Account/Model/Usage |
| Bottom panel | Tool/process/test/diagnostic/event projections |


---

<!-- SOURCE: 03-other/12-non-goals-and-deferred.md -->

# 3.12 Non-goals và Deferred

## Not goals for V2.0.0

- Cloud-hosted multi-user SaaS orchestration.
- Real-time collaborative editing between multiple humans.
- Arbitrary recursive agent spawning/delegation trees.
- Full marketplace/billing system for skills/agents.
- Training/fine-tuning models.
- Replacing Git with a custom version-control system.
- Executing assistant prose as a recovery mechanism for malformed tool calls.
- Perfect quota knowledge for providers that do not expose usage.
- Automatic bypass of provider usage/rate restrictions through account rotation.

## Deferred but extension-ready

- Organization/team policy layers above Project.
- Shared remote execution workers.
- Rich workflow-template marketplace.
- Cross-project portfolio orchestration.
- More advanced cost optimization/routing learned from historical performance.
- Message-granular undo below turn/event level if later required.

Deferral means the interfaces should not block future work, but V2 implementation SHOULD NOT add speculative complexity solely for these items.
