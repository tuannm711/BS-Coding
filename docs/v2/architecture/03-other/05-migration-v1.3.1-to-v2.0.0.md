---
doc_id: MIG-001
title: "Migration V1.3.1 → V2.0.0"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [migration, v1.3.1, v2.0.0, cutover, backup]
depends_on: []
---

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
