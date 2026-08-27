---
doc_id: COMP-EXT-001
title: "Skills, MCP và LSP"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [skills, mcp, lsp, extensions, tools]
depends_on: [COMP-TOOL-001, COMP-TEAM-001]
---

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
