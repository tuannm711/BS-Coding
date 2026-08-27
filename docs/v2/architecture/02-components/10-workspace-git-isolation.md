---
doc_id: COMP-WS-001
title: "Workspace và Git Isolation"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [git, worktree, workspace, branch, integration]
depends_on: [COMP-WF-001, COMP-TEAM-001]
---

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
