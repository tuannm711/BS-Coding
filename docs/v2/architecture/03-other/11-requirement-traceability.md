---
doc_id: TRACE-001
title: "Requirement Traceability"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [traceability, prototype, issues, mapping]
depends_on: []
---

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
