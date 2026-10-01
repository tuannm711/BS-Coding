# Copilot profile HTTP 400 — 2026-10-01

## Cause and reproduction

The v1.3.7 GitHub REST header used `X-GitHub-Api-Version: 2025-04-01`, an unsupported date. Device OAuth succeeded but the profile request returned HTTP 400. ProviderManager replaced the original status with the generic profile error shown in the screenshot.

Unauthenticated live requests to https://api.github.com/meta isolated the header: `2025-04-01` returned HTTP 400 (`Bad Request`); `2022-11-28` returned HTTP 200. No account token was used and no profile data was printed.

## Fix

The shared GitHub headers now use `2022-11-28` for profile, private email, Copilot runtime token and plan requests, including credential refresh. Profile failures use the typed authorization error to preserve the HTTP status while exposing no token or raw response body. Hotfix version: 1.3.8.

## Regression evidence

- A strict-version authorization test failed with the same profile HTTP 400 before the fix, then passed. It covers public identity, private email and initial/refreshed Copilot credentials.
- A manager integration test failed because HTTP 503 was hidden, then passed after preserving the typed profile error. Failed login still creates no account and exposes no token.
- Copilot Electron fixtures reject unsupported GitHub REST headers. Sign-in, copy, cancellation, denial recovery, snapshot refresh and closing during grant loading pass.
- Full Vitest: 164 files, 1,226 tests passed after the source fix.
- Typecheck and build passed. Two focused Electron Copilot tests passed.
- Windows local packaging (`npm run dist -- --publish never`) produced Setup and Portable v1.3.8 artifacts. The hotfix has not been published to GitHub in this task.
- Independent read-only review approved the scoped fix with no P1/P2 findings.
- Packaged ASAR inspection confirmed version 1.3.8, supported GitHub header and HTTP diagnostic. The packaged Windows executable launched with isolated test data and reported version 1.3.8; the fixture was closed and cleaned.

Full authorization against the user's Copilot subscription requires interactive confirmation on GitHub. Live evidence here verifies supported REST protocol behavior, while profile and entitlement regression tests use isolated fixtures.
