---
doc_id: COMP-TEAM-001
title: "Agent Team và Orchestrator"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [agents, orchestrator, roles, team, agent-version]
depends_on: [COMP-WF-001, COMP-PROVIDER-001]
---

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
