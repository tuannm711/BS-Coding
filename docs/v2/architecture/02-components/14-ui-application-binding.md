---
doc_id: COMP-UI-001
title: "UI / Application Binding"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [ui, electron, ipc, renderer, preload, figma]
depends_on: [CONTRACT-001, COMP-WF-001, COMP-DATA-001]
---

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
