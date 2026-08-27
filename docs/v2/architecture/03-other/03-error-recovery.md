---
doc_id: ERR-001
title: "Error Handling và Recovery"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [error, recovery, retry, quota, protocol-violation, crash]
depends_on: []
---

# 3.3 Error Handling và Recovery

## Error classes

| Class | Examples | Default response |
|---|---|---|
| User/action | permission denied, invalid config | show actionable error, no retry loop |
| Provider auth | expired/revoked token | refresh/reconnect, then block target |
| Quota/capacity | 429, pool exhausted | close epoch, cooldown, route if policy allows |
| Protocol | narrated tool call, malformed tool schema | corrective retry once, degrade/switch |
| Context | context length exceeded | recompile smaller context once, then switch/fail |
| Tool | command exit nonzero, MCP error | return structured result; workflow decides retry/rework |
| Workspace/Git | conflict, dirty base, worktree failure | block task/integration; preserve evidence |
| Quality | test/review failure | rework loop, not infrastructure retry |
| Process/app | crash/restart | mark orphaned runs interrupted; recover from durable state |

## Retry policy

Retries MUST be bounded and reason-specific. Exponential retry is appropriate for transient network errors, not code/test failures. Every retry attempt is auditable and counts against configured budget.

## Protocol violation recovery

1. record `protocol.violation`;
2. do not execute prose;
3. corrective structured-tool retry when supported;
4. if repeated, mark capability degraded for runtime epoch/model probe confidence;
5. offer/perform runtime switch if policy permits;
6. text-only mode disables coding execution tools visibly.

## Crash recovery

At startup scan non-terminal WorkflowRuns/AgentRuns. If underlying process cannot be proven alive, close runtime epoch as interrupted and set task/run to recoverable blocked/interrupted state. Never assume “still running in background” without a managed durable runtime mechanism.
