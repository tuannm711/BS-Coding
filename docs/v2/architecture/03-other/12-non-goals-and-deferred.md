---
doc_id: SCOPE-001
title: "Non-goals và Deferred"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [scope, non-goals, deferred, v2.0.0]
depends_on: []
---

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
