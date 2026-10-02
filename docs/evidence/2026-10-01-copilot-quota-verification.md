# Copilot account quota/credits — 2026-10-01

## Cause

The released adapter lacked fetchUsage, so ProviderManager advertised Copilot usage as unavailable. Device authorization fetched the Copilot user endpoint only for plan metadata; the account card had no quota source.

## Fix in the v1.3.9 candidate

OAuth accounts read https://api.github.com/copilot_internal/user with the GitHub identity token, supported REST version 2022-11-28 and a 15-second timeout. Runtime-only tokens are not sent to this GitHub identity endpoint. An explicitly imported GitHub identity token is retained. New Copilot authorizations independently refresh quota immediately; manual Refresh and scheduled polling use the same adapter and stale-data retention.

Premium requests, Chat and Completions render reported remaining/limit counts, percentages, reset dates and Unlimited. A ratio may be derived from provider-reported counts; absent or malformed numbers remain unknown. Token-billing placeholder zero quotas do not imply exhaustion. Credits used is displayed when GitHub reports it. No credit allowance or remaining balance is fabricated from subscription plan names or usage multipliers.

Account entitlements are informational for routing. The payload does not establish which exact model can use unlimited or premium calls, so these windows do not globally block the account. Actual recorded runtime quota refusals still apply.

## Regression evidence

- Parser tests failed before implementation; test cases cover premium240/30080%, reset, unlimitedchat/completions, tokenbillingplaceholder, SDK-style used90of300, malformedvalues, runtime-onlycredential refusal and importedidentity retention.
- UI test failed before remaining counts/Unlimited/credit display were wired, then passed.
- Authorization integration failed before automatic quota refresh, then passed with account240remaining.
- Electron fixture checks the full UI → IPC → ProviderManager → adapter → store → provider card path, exact token/header, Refresh, preserved stale240remaining onHTTP503 and reachable controls in a620pxwindow.
- Initial gate after implementation: 1,356 tests passed; TypeScript/build passed; focused Electron Copilot quota test passed.
- Independent review found one P2: count-only quota marked unavailable and retained old stale data. Three regression cases failed, then passed after treating reported remaining counts as known while leaving percentage/allowance unknown. Electron also exercises a fresh count-only 200 after a stale 240.
- Final TypeScript/build gates passed; full unit/integration now 177 files and 1,359 tests passed. The opt-in Chromium integration remains skipped in the default suite, as designed.
- Final full Electron gate: 29/29 passed (57.0s), including a count-only fresh quota after API503/stale history. Strict UI audit has zero findings.
- Local Windows packaging (`npm run dist -- --publish never`) produced Setup/Portable v1.3.9. No GitHub release was requested or created in this task.
- Packaged executable launched with isolated data and reported v1.3.9. A fixture quota request through the real IPC/manager/adapter path returned fresh count-only 200, credits used 3.2 and usage capability supported; identity-token check passed. Fixture app/data were closed/cleaned.

This task uses fixtures for authenticated quota requests; no real Copilot account token was inspected/decrypted or quota API queried with user credentials. The endpoint is an internal GitHub API and may change shape. GitHub may report credit consumption without an included-credit ceiling/remaining balance; UI explicitly states that missing data.

## Sources

- Official Copilot SDK quota contract: https://github.com/github/copilot-sdk/blob/main/docs/features/usage-and-billing.md (entitlementRequests, usedRequests, remainingPercentage, resetDate; -1 unlimited).
- Independent endpoint implementation inspected for schema/protocol evidence: https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Providers/Copilot/CopilotUsageFetcher.swift (identity-token request, quota snapshots, credits_used, no published credit ceiling). Its API version value was not reused; this app retains the verified supported REST version.
