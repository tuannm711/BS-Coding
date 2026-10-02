# Copilot model catalog — 2026-10-01

## Cause and scope

The adapter seeded/statically returned gpt-4.1 and claude-sonnet-4 and never queried the Copilot catalog. The user approved replacing that list with authenticated account discovery. The v1.3.9 local candidate retains the quota/credit fix while adding dynamic models.

## Implemented behavior

- GET /models on the validated Copilot API host using a runtime credential and 15-second timeout.
- Token-mint endpoints.api metadata is retained for account routing. Only trusted HTTPS api.*.githubcopilot.com hosts/root paths are accepted, without userinfo/query/hash/nonstandard ports.
- Catalog IDs/names are preserved; context/output limits come from reported capabilities. Prompt-only capacity is not misrepresented as full context.
- Hidden/disabled/malformed access flags, non-chat/missing streaming/tool capabilities, incompatible plan restrictions and unsupported endpoints are filtered.
- Chat Completions and Responses transports are implemented; Messages-only models are excluded. Models with absent endpoint metadata use compatible chat only when streaming/tool chat capabilities are explicit.
- Imported account creation loads the remote catalog before saving; OAuth hydration and Refresh also load it. No static two-model fallback is used on errors or empty compatible catalog.
- Refresh preserves cached models with an error if discovery fails; it does not silently replace assignments/history. An available selected model remains selected.

## Regression evidence

- New parser/fetch tests were run RED before implementation, then GREEN. Coverage includes more than two models, policy/picker filtering, plan restrictions, invalid flags, deduplication, exact names/limits, endpoint validation, Responses-only inference and token-advertised account endpoint.
- Existing import/OAuth/transport tests now explicitly stub a remote catalog instead of accepting a production static list.
- Initial full test gate: 178 files, 1,368 tests passed; TypeScript and build passed.
- Four focused Electron Copilot tests passed. The new catalog fixture returns seven entries and four eligible models; Settings/ModelPicker show the four, an available selected ID remains, and an HTTP503 refresh retains catalog with model error state.
- Independent read-only review found two P2s: duplicate import catalog lookup could fail after saving, and malformed enabled/disabled flags could be accepted. Both were reproduced RED and fixed GREEN. Copilot import now reuses its pre-save validated catalog; access flags must have valid boolean types. Imported identity credentials obtain authenticated plan metadata for restrictions, rather than trusting an imported plan claim. Runtime-only unknown plan restrictions are not guessed.

## Final gates

- TypeScript node/web/extension/tests PASS.
- Full unit/integration: 178 files and 1,370 tests PASS; opt-in Chromium test remains skipped in the ordinary gate.
- Build extension/native helper/main/preload/renderer PASS.
- Full Electron E2E: 30/30 PASS.
- Strict UI audit: zero findings.
- A final Electron regression reproduced the old selected-model placeholder still appearing available after the API disables that ID. It now keeps the historical assignment without silently replacing it, but marks the option unavailable/disabled; valid selected models remain selected. RED→GREEN verified.
- Initial packaging at release/win-unpacked was blocked by Windows because the user's test app holds its executable. The candidate is packaged separately under release/copilot-catalog, keeping the running test session.
- Local Setup/Portable v1.3.9 candidate rebuild succeeded. No tag or GitHub publication was requested/performed in this task.
- Packaged smoke: actual candidate executable reports v1.3.9; a fixture Refresh fetches three exact IDs from the account-specific endpoint with runtime credential, stores reported limits/Responses routing and advertises remote discovery. Temporary fixture app/data were closed and cleaned.

## Verification boundaries

No real Copilot token was decrypted/inspected or sent by shell scripts. Authenticated discovery and inference were exercised with fixtures. The actual account model count depends on the API's current catalog, subscription, organization policies and supported transports. Refresh in the updated app obtains the real list. Messages-only models are not supported, and unknown restricted plan metadata is not guessed.

## Approved strict filter — 2026-10-02

- User approved requiring explicit picker permission and enabled policy. Discovery now requires both `model_picker_enabled === true` and `policy.state === 'enabled'`; missing/empty/null metadata does not establish availability.
- RED: the new parser regression reproduced three wrongly accepted entries (missing picker, missing policy, empty policy). GREEN: all 11 catalog tests passed after the two access checks were tightened.
- Full unit/integration gate: 178 files passed, 1,371 tests passed; one opt-in test skipped. TypeScript and production build passed.
- Focused Electron catalog regression passed: ten remote entries reduce to four eligible choices; missing picker/policy/empty policy models are excluded from Settings and ModelPicker. Valid selection, disabled historical selection and HTTP503 cache preservation still pass.
- Previously cached lists are updated on successful Refresh/startup discovery. A discovery failure still retains the last known list with an error. No real per-model inference/credit-spending validation was performed.

## Release gate — 2026-10-02

- User requested publication of v1.3.9. Unit/integration: 1,371 PASS (one opt-in skip); TypeScript PASS.
- The first full Electron run exposed an older device-authorization fixture without policy metadata (29 PASS, 1 FAIL). The fixture now explicitly advertises enabled policy, as required by the approved filter. A fresh full rerun passed 30/30.
- Published artifacts are generated by the existing tag-triggered release workflow after merging develop/v1 into release/v1. The local candidate already passed production build and Windows packaging.

## Sources

https://docs.github.com/en/copilot/reference/ai-models/supported-models describes plan/client-dependent availability. Observed API shape (picker/policy/supports/limits and runtime catalog) was compared through Firecrawl with independent Copilot integrations, including https://github.com/kilo-org/kilocode/issues/2885 and https://github.com/haseebkhalid1507/synapscli/blob/main/docs/specs/github-copilot-oauth-spec.md. These sources guide protocol parsing; no public model-name list is used as account entitlement.
