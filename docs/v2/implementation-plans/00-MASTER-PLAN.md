# BS Coding V2.0.0 Implementation Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Each detailed plan in `plans/` is an independent review gate. Do not execute a later plan if a required producer interface from an earlier plan is red.

**Goal:** Upgrade BS Coding from V1.3.1 to V2.0.0 using the locked architecture pack and approved Figma Make prototype, with a clean V2 core, canonical runtime portability, deterministic multi-agent workflow orchestration, safe migration and production cutover.

**Architecture source:** `../architecture/README.md` and `../architecture/BS_CODING_V2_ARCHITECTURE_SPEC.md`  
**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1  
**Repository baseline:** `tuannm711/BS-Coding`, `master@8160ce8d2b61da2253e906843978ee5014c97467`, package version `1.3.1`.

## 1. Non-Negotiable Target

```text
Project
  → WorkSession
    → WorkflowRun
      → Task / TaskRun
        → Assignment
          → AgentRun
            → RuntimeEpoch
              → CanonicalEvent
```

```text
Provider → Account → Model → RuntimeTarget → RuntimeEpoch
AgentDefinition → AgentVersion → AgentRun
WorkflowEngine → Task Graph → Agent assignments → Integration → Quality gates
```

The UI follows user intent/work state, while provider/model/account/tool details remain support resources. Runtime/model switching never continues the old provider-native conversation; it compiles canonical context and starts a new RuntimeEpoch.

## 2. Execution Rules for AI Coder

1. Create an isolated Git worktree/feature branch for V2 before implementation. Do not build V2 directly on `master`.
2. Read `architecture/README.md`, `architecture/03-other/07-coding-rules-and-boundaries.md`, this master plan, then only the detailed plan currently being executed.
3. Use TDD: failing focused test → minimal implementation → focused green test → broader relevant suite → commit.
4. Keep V2 side-by-side with V1 until Plan 20 cutover. Never turn `BsAgentManager` into the V2 central dependency.
5. Reuse V1 provider/tool/MCP/LSP/vault/updater/browser capabilities only through compatibility adapters with deletion/cutover criteria.
6. Do not call real model/provider APIs in automated tests.
7. At the end of every detailed plan, run its completion gate and record the commit SHA in `docs/v2/implementation-progress.md`.
8. If architecture and old V1 docs disagree, current source is V1 factual baseline; the V2 architecture pack is target behavior; Figma is target UX behavior.

## 3. Master Dependency Graph

```text
P01 Foundation
 ├─ P02 Domain
 │   ├─ P03 Persistence
 │   │   └─ P04 Canonical Events
 │   │       ├─ P05 Provider/Router
 │   │       │   └─ P06 Context + RuntimeEpoch
 │   │       │       └─ P08 Agent Runtime
 │   │       └─ P07 Tool Guard ───────────┘
 │   │                                   │
 │   └───────────────────────────────────┴─ P09 Workflow
 │                                         └─ P10 Team/Orchestrator
 │                                             ├─ P11 Git Isolation
 │                                             └─ P12 Review/Gates
 │
 ├─ P13 Skills/MCP/LSP (after P07/P08)
 ├─ P14 IPC (after backend contracts stable)
 │   └─ P15 Renderer/Figma
 ├─ P16 Security (cross-cutting; final after P14)
 ├─ P17 Observability/Budget
 ├─ P18 V1 Migration (after schema/domain stable)
 ├─ P19 Updates/Remote
 └─ P20 Verification/Cutover (all predecessors)
```

## 4. Milestones and Release Gates

| Milestone | Detailed plans | Deliverable | Gate |
|---|---|---|---|
| M0 Baseline | P01 | V2 compiles side-by-side | No user-visible behavior change |
| M1 Durable Core | P02-P04 | Domain + SQLite + canonical events | Restart/replay deterministic |
| M2 Runtime Portability | P05-P08 | routing/context/epoch/tools/agent loop | TEST-REG-01..03 green |
| M3 Workflow Engineering | P09-P12 | DAG/team/worktrees/review/rework | full fake-runtime workflow green |
| M4 Extension Integration | P13, P16-P17, P19 | MCP/LSP/security/usage/remote | no bypass of V2 boundaries |
| M5 App Contract | P14 | typed IPC/preload | renderer cannot access secrets/raw Node |
| M6 UX | P15 | Figma prototype bound to real projections | AC-UX-01..04 + core E2E |
| M7 Data Upgrade | P18 | backup-first idempotent migration | TEST-REG-08 green on V1 fixture |
| M8 Release | P20 | writer cutover + 2.0.0 package | all AC + build + E2E + migration dry run |

## 5. Parallelization Allowed

After P04, P05 and P07 can proceed in parallel because both depend on stable canonical/shared contracts. P13 can proceed once ToolDefinition/AgentRuntime interfaces are stable. P16 and P17 may proceed in parallel with renderer work after IPC DTOs settle. P18 importer work may start after P03/P04 but final validation waits for agent/provider/workflow schemas to freeze.

Never parallelize two tasks that modify the same shared contract file without first merging and re-running typecheck. Parallel code-writing workers must use separate Git worktrees.

## 6. Detailed Plan Index

| # | File | Purpose | Depends on |
|---:|---|---|---|
| 01 | [`plans/01-foundation-module-boundaries.md`](plans/01-foundation-module-boundaries.md) | V2 Foundation and Module Boundaries | — |
| 02 | [`plans/02-domain-model-state-machines.md`](plans/02-domain-model-state-machines.md) | Domain Model and State Machines | 01 |
| 03 | [`plans/03-sqlite-persistence-event-store.md`](plans/03-sqlite-persistence-event-store.md) | SQLite Persistence, Event Store and Artifact Metadata | 01-02 |
| 04 | [`plans/04-canonical-event-protocol.md`](plans/04-canonical-event-protocol.md) | Canonical Event Protocol | 01-03 |
| 05 | [`plans/05-provider-account-model-routing.md`](plans/05-provider-account-model-routing.md) | Provider, Account, Model and Routing | 01-04 |
| 06 | [`plans/06-context-compiler-runtime-epoch.md`](plans/06-context-compiler-runtime-epoch.md) | Context Compiler and Runtime Epoch Switching | 02-05 |
| 07 | [`plans/07-tool-execution-protocol-guard.md`](plans/07-tool-execution-protocol-guard.md) | Tool Execution and Protocol Guard | 02,04 |
| 08 | [`plans/08-agent-runtime-v2.md`](plans/08-agent-runtime-v2.md) | Agent Runtime V2 | 04-07 |
| 09 | [`plans/09-workflow-task-graph-engine.md`](plans/09-workflow-task-graph-engine.md) | Workflow / Task Graph Engine | 02-04,08 |
| 10 | [`plans/10-agent-team-orchestrator.md`](plans/10-agent-team-orchestrator.md) | Agent Team and Orchestrator | 02,08-09 |
| 11 | [`plans/11-git-worktree-integration.md`](plans/11-git-worktree-integration.md) | Workspace and Git Worktree Isolation | 09-10 |
| 12 | [`plans/12-review-quality-gates.md`](plans/12-review-quality-gates.md) | Review, Rework and Quality Gates | 09-11 |
| 13 | [`plans/13-skills-mcp-lsp.md`](plans/13-skills-mcp-lsp.md) | Skills, MCP and LSP Integration | 07-08 |
| 14 | [`plans/14-ipc-preload-contracts.md`](plans/14-ipc-preload-contracts.md) | Typed IPC and Preload Contracts | core through 13 |
| 15 | [`plans/15-renderer-ui-figma-binding.md`](plans/15-renderer-ui-figma-binding.md) | Renderer V2 UI and Figma Prototype Binding | 14 + backend projections |
| 16 | [`plans/16-security-permissions-secrets.md`](plans/16-security-permissions-secrets.md) | Security, Permissions and Secrets | 04,07,14 |
| 17 | [`plans/17-observability-usage-budget.md`](plans/17-observability-usage-budget.md) | Observability, Usage, Quota and Budget | 03-05,10,16 |
| 18 | [`plans/18-v1-migration-cutover.md`](plans/18-v1-migration-cutover.md) | V1.3.1 Data Migration and Cutover Preparation | 02-05 + stable schemas |
| 19 | [`plans/19-updates-remote-control.md`](plans/19-updates-remote-control.md) | Updates and Remote Control V2 Integration | 14,16 |
| 20 | [`plans/20-verification-release-cutover.md`](plans/20-verification-release-cutover.md) | V2 Verification, Cutover and Release | 01-19 |


## 7. Cross-Plan Definition of Done

A detailed plan is DONE only if: its focused tests pass; `npm run typecheck` passes; new public contracts have Zod/runtime validation where external; no forbidden dependency direction was introduced; no production path executes narrated tool prose; new state transitions have deterministic tests; no secret reaches renderer/log/event fixtures; the plan's commit SHA is recorded.

## 8. Release-Level Blocking Acceptance

The release cannot be declared complete until all criteria in `architecture/03-other/08-acceptance-criteria.md` are mapped in `docs/v2/acceptance-matrix.md`. At minimum this includes persistence/restart recovery, runtime epoch portability, narrated-tool protection, multi-account routing, isolated parallel writes, non-writing Orchestrator, review/rework gating, renderer secret boundary, migration idempotency, locked navigation/tabs/lifecycle and the final production build.

## 9. Suggested Commit/PR Strategy

Use one branch/PR per detailed plan when practical (`v2/p01-foundation`, `v2/p02-domain`, ...). When a plan is too tightly coupled to the immediately previous plan, use one branch but preserve one independently green commit per task and one plan-complete checkpoint commit. Do not squash away migration/release evidence until after review.

## 10. AI Coder Start Command

Read in this order before coding:

```text
architecture/README.md
architecture/03-other/07-coding-rules-and-boundaries.md
plans/00-MASTER-PLAN.md
plans/01-foundation-module-boundaries.md
```

Then execute only P01. After its completion gate is green and reviewed, proceed to P02 according to the dependency graph.
