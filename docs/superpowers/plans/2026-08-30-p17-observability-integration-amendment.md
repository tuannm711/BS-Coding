# P17 Observability Integration Amendment Plan

1. Make cost optional/known explicitly; define strict canonical USAGE payload.
2. Atomically project USAGE events into the idempotent SQLite ledger.
3. Route runtime finish usage into a usage sink and gate assignment dispatch with budget admission.
4. Add scoped usage/quota IPC projections and bind Work/Providers UI.
5. Run focused tests, full tests, build, E2E and P0-P2 review before local merge.

Approved by the project owner on 2026-08-30.
