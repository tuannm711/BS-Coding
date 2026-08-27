# BS Coding — Provider & Agent Control Room Design

## Goal

Make provider, account, model, and agent configuration easy to scan and hard to misconfigure when several models are used in one project.

## Visual direction

The settings UI uses a dark control-room language: quiet navy surfaces, electric-blue active states, amber quota states, and monospace utility data. Existing typography and tokens remain the foundation. The distinctive element is an assignment rail showing `provider → account → model → variant` as one readable route.

## Providers tab

Providers are displayed as stacked cards. Each card has a provider header, connection state, account count, and actions. Accounts are nested under the provider rather than rendered as unrelated rows.

Each account displays:

- label/email and auth mode;
- active/disabled/expired/error state;
- plan name and subscription expiry when available;
- account-level quota: used/limit, banked used/limit, reset countdown, refreshed time;
- models available to that account;
- enable, disable, switch active, refresh quota, and remove actions.

Quota is owned by `ProviderAccount`, never by an Agent. Providers without a quota adapter show `Unavailable` with a clear reason and a refresh action.

## Agents tab

Agents are displayed as editable cards. Each card contains:

- required name;
- optional system prompt with an explicit “Use default prompt” state;
- assignment rail: provider → account → model → reasoning/variant;
- enabled/disabled state;
- edit, duplicate, enable/disable, and remove actions.

The assignment is persisted in the existing agent configuration shape. OAuth account selection uses the same account IDs as Providers. Model and variant options are filtered by the selected provider/account.

## Chat

The direct ModelPicker is replaced by an AgentPicker. Chat selects an Agent, then resolves the Agent’s provider/account/model/variant assignment in the main process. Chat does not mutate the Agent assignment; edits happen in Settings → Agents. The current Agent name and model remain visible in the chat header for orientation.

## Quota data flow

Provider adapters fetch quota for each account and normalize it into `ProviderUsage`. The manager persists the latest usage on the account and broadcasts account-level usage events. Providers tab and the right-panel session card consume the same account usage source.

The right-panel session card groups active Agents by account, not by Agent. Each account row lists the models and Agents using it, then shows the shared quota, banked quota, reset countdown, subscription expiry, and freshness state.

## Empty and error states

- No providers: explain how to connect a provider.
- Provider with no accounts: show connect/sign-in action.
- Agent without assignment: show “Choose provider and model” inline.
- Quota unavailable: show “Quota unavailable” plus adapter/refresh explanation.
- Expired account: preserve assignment but disable execution until re-authenticated or switched.

## Accessibility and interaction

Cards use semantic headings, labelled controls, visible keyboard focus, and status text that is not conveyed by color alone. Lists remain scrollable on small settings windows. Actions use plain verbs: “Refresh quota”, “Disable”, “Switch”, “Remove”.

## Verification

- Unit tests for AgentPicker assignment persistence and account-level quota grouping.
- Unit tests for provider quota normalization and unavailable/expired states.
- Typecheck, full unit suite, build, and relevant E2E smoke checks.
