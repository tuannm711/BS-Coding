# P17 Observability Integration Amendment Design

## Decision

P17 is not complete until canonical usage events project atomically into the
single SQLite ledger, budget policy gates actual V2 assignment dispatch, and
typed usage/quota projections reach Work and Providers UI.

Provider cost is optional. Missing price/cost data is represented as unknown,
never fabricated as zero. Configured cost budgets with unknown cost require
explicit approval rather than silently allowing dispatch.

## Pipeline

Runtime finish usage → strict canonical `USAGE` event → atomic SQLite usage
projection → scoped totals → budget evaluator/admission → typed IPC/UI.

V1 provider compatibility may supply token/quota metadata structurally but must
not invent provider pricing or expose secrets/provider-native handles.
