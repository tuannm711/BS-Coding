# Quota Control Room Card — Design Spec

## Goal

Give the Providers panel and chat right panel a compact, account-level quota dashboard that mirrors the useful parts of Cockpit Tools while keeping agent-specific speed and usage visible.

## Decisions

- Speed is an agent/session setting. `standard` is the default; `fast` maps to the Codex `priority` service tier for that request only.
- Quota belongs to the provider account, not to an agent or model. Agents using one account are grouped under that account card.
- Progress bars show remaining quota (`100 - used_percent`). The numeric remaining percentage is always rendered as text so color is not the only signal.
- Server-reported quota usage and locally calculated usage are separate. The card labels local cost as `Estimated billed` and never presents it as OpenAI billing data.
- Missing API fields render as `—`; no quota value is inferred from an unrelated token limit.

## Card layout

Each account card uses the approved B layout:

1. Header: account email/name, account type (OAuth/ChatGPT), plan badge, subscription expiry, refresh state.
2. Agent speed row: each active agent appears with its model and a Standard/Fast segmented control. Changing it persists to that agent and affects subsequent turns.
3. Two progress sections: 5-hour window and weekly window, each with remaining percentage, accessible progress bar, and next reset countdown.
4. Usage grid since the latest available reset boundary: requests, input tokens, output tokens, estimated billed, and last refresh.

The right-panel version collapses the same information to the active session's account cards and keeps the account grouping intact. The Providers tab uses the full card and can refresh one account.

## Data contract

Extend `ProviderUsage` with account display metadata, secondary reset, plan expiry, and reset-bounded usage fields:

```ts
interface ProviderUsage {
  accountId: string
  accountLabel?: string
  accountType?: 'oauth' | 'api-key' | 'session'
  planName?: string
  subscriptionExpiresAt?: number
  primaryUsedPercent?: number
  secondaryUsedPercent?: number
  resetAt?: number
  secondaryResetAt?: number
  requestsUsed?: number
  tokensInput?: number
  tokensOutput?: number
  estimatedBilled?: number
  refreshedAt: number
  source: 'provider' | 'internal' | 'unavailable'
  status: 'ok' | 'near-limit' | 'expired' | 'unavailable'
  unavailableReason?: string
}
```

The `wham/usage` adapter reads `rate_limit.primary_window` and `rate_limit.secondary_window`, retaining support for the legacy root and `rate_limits` shapes. `used_percent` is converted to remaining percent only at the UI view-model boundary. Reset timestamps prefer `reset_at`, falling back to `reset_after_seconds`.

Local usage is accumulated from completed agent turns. It is filtered by the selected account and reset boundary when that boundary is known; otherwise it is marked `current session` and not falsely attributed to a provider period. Input/output values come from the existing `MessageTokens` data. Estimated billed uses the existing pricing table and is labeled explicitly.

## Speed data flow

Add `speed?: 'standard' | 'fast'` to `AgentSettings`/persisted agent config, centralize the IPC channel as `AgentSetSpeed`, and expose `setAgentSpeed` from preload. The agent manager stores the value with the running agent. The LLM request options carry `serviceTier?: 'priority'`; `OpenAIResponsesClient` sends `service_tier: 'priority'` only for Fast. Other providers ignore the field. Standard omits the override.

## Error and loading behavior

- A card can show `Loading quota…`, stale cached data with its `refreshedAt`, or a concise API error with a retry button.
- A 401/403 response indicates re-authentication; 404 indicates endpoint/schema incompatibility; network errors include retry state.
- Refreshing one account must not clear other account cards.

## Accessibility and visual rules

- Use existing semantic theme tokens and Lucide icons; no emoji or ad-hoc colors.
- Progress bars have `role="progressbar"`, `aria-valuenow`, and a visible percentage label.
- Standard/Fast controls are keyboard reachable, have visible selected state and descriptive labels.
- Preserve compact dashboard density, 8px spacing rhythm, readable tabular numerals, and dark/light contrast.

## Testing

- Unit tests for parsing current/legacy quota response shapes and reset fallbacks.
- Unit tests for remaining-percent view model and missing-field behavior.
- Unit tests for agent speed persistence and OpenAI `service_tier` request payload.
- Renderer tests for progress-bar accessibility, account grouping, and speed toggle state.
- Required verification: `npm run typecheck`, `npm test`, `npm run build`; run E2E if the existing harness covers settings/chat panels.
