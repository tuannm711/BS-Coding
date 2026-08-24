# Provider architecture verification evidence

Date: 2026-08-23

Branch: `codex/bs-coding-rebrand`

Plan: `docs/superpowers/plans/2026-08-23-cockpit-provider-architecture-v2.md`

## Automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Unit + integration | PASS | `npm test`: 116 files, 809 tests passed |
| TypeScript | PASS | `npm run typecheck` completed for node, web, extension, and server |
| Production build | PASS | `npm run build`; main, preload, renderer, and browser extension built |
| Electron e2e | PASS | `npm run e2e`: 12 Playwright tests passed |
| Patch hygiene | PASS | `git diff --check` returned no errors |

New acceptance coverage includes:

- `tests/unit/ipc-provider-state.test.ts`
- `tests/integration/assignment-reopen.test.ts`
- `tests/integration/provider-refresh.test.ts`
- `tests/unit/renderer-agent-assignment.test.tsx`
- `tests/unit/quota-snapshot.test.tsx`
- `tests/unit/antigravity-runtime.test.ts`
- `tests/unit/provider-adapter-contract.test.ts`
- `tests/integration/provider-agent-chat.test.ts`

The final integration path performs an Antigravity PKCE OAuth callback, token/profile/model discovery, canonical assignment migration, manager/workspace restart, and `BsAgentManager` chat over mocked Cloud Code SSE. It does not insert the provider account directly.

Antigravity-specific regression coverage also proves that BS Coding resolves the real Cloud Code project and plan through `loadCodeAssist`, persists that context through restart, sends the response-map key as the runtime model identifier, keeps the friendly display name, selects quota for the session model, and never renders `100% left` while the provider reports quota exhaustion.

Tool-call continuation coverage proves that Gemini `thoughtSignature` metadata survives Cloud Code SSE parsing, session persistence and request replay. Legacy Gemini 3 tool calls without stored metadata use Google's documented `skip_thought_signature_validator` compatibility sentinel.

## Running-app evidence

Production build started successfully with `npm run start`. No main-process errors were emitted at launch.

The following account-dependent checks were observed by the user in the running BS Coding app after the final fixes. No account identifiers, prompts, tokens, or provider response bodies were recorded.

| Acceptance case | Expected result | Result |
| --- | --- | --- |
| Settings → Agents exact model reopen | Select a non-first account model, Save, close and reopen Settings; the exact model remains selected | PASS — user verified |
| Workspace/app restart persistence | Restart the workspace/app; provider, account, model, and speed remain exact | PASS — user verified after app restart |
| Live quota model update | Change the active agent/model; the right-panel card immediately lists the new model and all agents on the account | PASS — user verified |
| Providers dashboard | Connected accounts are grouped by provider in vertical cards; Activate/Deactivate, Refresh, Reconnect, Remove and refresh-stage badges are visible | PASS — user verified |
| Add provider descriptors | Add provider offers OpenAI OAuth, Antigravity OAuth, and API/import methods declared by provider descriptors | PASS — OpenAI and Antigravity OAuth observed; other descriptors covered by automated tests |
| OAuth chat transport | ChatGPT OAuth and Antigravity OAuth can send a chat without a missing API-key error | PASS — three ChatGPT accounts and Antigravity verified by user |
| Antigravity quota state | Real remaining/reset values or an explicit quota/capacity/cooldown/auth state is shown | PASS — user verified the quota dashboard state |

## Notes

- Automated tests prove exact persistence, account/model-aware migration, stale snapshot and assignment rejection, adapter endpoints/headers, PKCE, OAuth credential rotation across model/usage/runtime stages, Cloud Code SSE/tool continuation, 401 refresh-once behavior, structured 429/503 recovery, refresh/remove races, reconnect-in-place, and no first-model fallback.
- Manual account checks are retained as a separate gate because mocked provider responses cannot prove the user's real OAuth profile, subscription metadata, or current provider quota.
