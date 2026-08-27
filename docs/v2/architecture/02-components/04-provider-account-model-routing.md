---
doc_id: COMP-PROVIDER-001
title: "Provider, Account, Model và Routing"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [provider, account, model, quota, routing, auto, preferred, pinned]
depends_on: [COMP-SESSION-001]
---

# 2.4 Provider, Account, Model và Routing

## Scope

This component owns global provider connectivity, provider accounts, model catalogs, capability verification, usage/quota data and runtime-target routing. It does not own Agent role behavior or Workflow state.

## Target contracts

```ts
interface ProviderAdapter {
  definition(): ProviderDefinition
  connect(input: ConnectInput): Promise<ProviderAccount>
  refreshAccount(account: ProviderAccount): Promise<ProviderAccount>
  listModels(account: ProviderAccount): Promise<ModelDescriptor[]>
  createModelRuntime(target: RuntimeTarget): Promise<ModelRuntime>
  createNativeRuntime?(target: RuntimeTarget): Promise<NativeAgentRuntime>
  fetchUsage?(account: ProviderAccount): Promise<ProviderUsage>
  recoverRuntimeContext?(...): Promise<unknown>
}
```

`ModelDescriptor` MUST expose verified/declared capabilities separately: streaming, structured tool calls, parallel tools, tool choice, reasoning, images, structured output, context window and native resume support.

## Account policy

Agent runtime policy supports:

- `AUTO`: router chooses eligible account/target.
- `PREFERRED`: use configured account when healthy, otherwise route automatically.
- `PINNED`: only configured account; fail/block when unavailable unless the user explicitly changes policy.

There is no exclusive provider-level `activeAccountId` in V2.

## Router pipeline

1. Filter by provider/model/runtime compatibility and required capabilities.
2. Exclude disabled, expired, unsupported and pool-spent targets.
3. Apply policy constraints (AUTO/PREFERRED/PINNED).
4. Score eligible targets using **explicitly designed signals**: quota health, cooldown, active load, recent failures, latency, estimated cost/budget and capability health.
5. Select target and make it sticky for the Runtime Epoch.
6. On quota/capacity/provider refusal, close epoch, mark cooldown/pool error, and route again if policy allows.

The router MUST NOT rotate accounts to evade provider limits or terms. It may choose among legitimate enabled accounts for availability/capacity management.

## Quota models

V2 MUST support at least:

- Reset windows: session/weekly/monthly/additional.
- Balance/credit model: remaining balance with no reset time.
- Unknown/silent usage: tracked local usage only, confidence marked unknown.

Routing MUST use per-pool/group state where models share quota.

## Capability probe

A model SHOULD be testable with a safe structured-tool probe. Results are persisted as `VERIFIED | DEGRADED | UNSUPPORTED | UNKNOWN` with timestamp/provider version. A degraded structured-tool model MUST NOT be selected for coding work requiring tools unless explicit text-only mode or user override is active.
