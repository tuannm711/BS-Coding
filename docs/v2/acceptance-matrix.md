# V2 Acceptance Matrix

Executable traceability for the locked criteria in
`architecture/03-other/08-acceptance-criteria.md`. A row is `PASS` only when the
listed automated evidence runs without a real provider/model. Release-only
manual/package checks are added by P20 Task 4.

| Criterion | Status | Automated evidence |
|---|---|---|
| `AC-CORE-01` | PASS | `tests/e2e/v2-core-flow.spec.ts`, `tests/e2e/smoke.spec.ts` |
| `AC-CORE-02` | PASS | `tests/e2e/v2-backend-projections.spec.ts`, `tests/unit/v2/repositories.test.ts` |
| `AC-CORE-03` | PASS | `tests/integration/v2/work-session-lifecycle.test.ts`, `tests/unit/v2/workflow-engine.test.ts` |
| `AC-RUN-01` | PASS | `tests/e2e/v2-runtime-switch.spec.ts`, `tests/unit/v2/runtime-epoch-service.test.ts` |
| `AC-RUN-02` | PASS | `tests/unit/v2/context-compiler.test.ts`, `tests/unit/v2/context-policy.test.ts`, `tests/e2e/v2-backend-projections.spec.ts` |
| `AC-RUN-03` | PASS | `tests/unit/v2/protocol-guard.test.ts`, `tests/unit/v2/event-assembler.test.ts` |
| `AC-PROV-01` | PASS | `tests/unit/v2/account-router.test.ts`, `tests/unit/v2/provider-contract.test.ts` |
| `AC-PROV-02` | PASS | `tests/unit/v2/account-router.test.ts`, `tests/unit/v2/runtime-epoch-service.test.ts` |
| `AC-PROV-03` | PASS | `tests/unit/v2/capability-probe.test.ts`, `tests/unit/v2/protocol-guard.test.ts` |
| `AC-WF-01` | PASS | `tests/unit/v2/task-graph.test.ts`, `tests/unit/v2/workflow-engine.test.ts` |
| `AC-WF-02` | PASS | `tests/integration/v2/worktree-manager.test.ts`, `tests/integration/v2/work-session-lifecycle.test.ts` |
| `AC-WF-03` | PASS | `tests/unit/v2/orchestrator-policy.test.ts`, `tests/unit/v2/permission-engine.test.ts` |
| `AC-WF-04` | PASS | `tests/integration/v2/work-session-lifecycle.test.ts`, `tests/integration/v2/rework-lifecycle.test.ts` |
| `AC-SEC-01` | PASS | `tests/unit/v2/renderer-security-boundary.test.ts`, `tests/unit/v2/event-redaction.test.ts`, `tests/unit/v2/preload-contract.test.ts` |
| `AC-SEC-02` | PASS | `tests/unit/v2/tool-executor.test.ts`, `tests/unit/v2/v1-mcp-adapter.test.ts`, `tests/integration/v2/remote-adapter.test.ts` |
| `AC-DATA-01` | PASS | `tests/unit/v2/backup-service.test.ts`, `tests/integration/v2/migration-idempotency.test.ts`, `tests/integration/v2/production-migration.test.ts` |
| `AC-UX-01` | PASS | `tests/unit/v2/renderer-navigation.test.tsx`, `tests/e2e/smoke.spec.ts` |
| `AC-UX-02` | PASS | `tests/unit/v2/work-session-screen.test.tsx`, `tests/e2e/v2-core-flow.spec.ts` |
| `AC-UX-03` | PASS | `tests/unit/v2/workflow-lifecycle.test.ts`, `tests/unit/v2/retry-policy.test.ts`, `tests/e2e/v2-runtime-switch.spec.ts` |
| `AC-UX-04` | PASS | `tests/unit/v2/work-projections.test.ts`, `tests/integration/v2/p15-backend-routes.test.ts`, `tests/e2e/v2-runtime-switch.spec.ts` |

## Mandatory regression traceability

| Regression | Status | Evidence / P20 action |
|---|---|---|
| `TEST-REG-01` | PASS | `tests/integration/v2/runtime-portability.test.ts` |
| `TEST-REG-02` | PASS | `tests/integration/v2/routing-regression.test.ts` |
| `TEST-REG-03` | PASS | `tests/integration/v2/tool-protocol-regression.test.ts` |
| `TEST-REG-04` | PASS | `tests/integration/v2/work-session-lifecycle.test.ts`, `tests/integration/v2/rework-lifecycle.test.ts` |
| `TEST-REG-05` | PASS | `tests/unit/v2/workflow-lifecycle.test.ts`, `tests/e2e/v2-runtime-switch.spec.ts` |
| `TEST-REG-06` | PASS | `tests/integration/v2/worktree-manager.test.ts`, `tests/integration/v2/integration-service.test.ts` |
| `TEST-REG-07` | PASS | `tests/unit/v2/preload-contract.test.ts`, `tests/unit/v2/renderer-security-boundary.test.ts`, `tests/e2e/smoke.spec.ts` |
| `TEST-REG-08` | PASS | `tests/unit/v2/backup-service.test.ts`, `tests/integration/v2/migration-idempotency.test.ts` |
