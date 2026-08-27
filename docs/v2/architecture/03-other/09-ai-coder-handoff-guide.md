---
doc_id: HANDOFF-001
title: "AI Coder Handoff Guide"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [ai-coder, handoff, implementation, prototype, retrieval]
depends_on: []
---

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
