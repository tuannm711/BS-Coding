---
doc_id: GLOSS-001
title: "Glossary"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [glossary, terms, definitions]
depends_on: []
---

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
