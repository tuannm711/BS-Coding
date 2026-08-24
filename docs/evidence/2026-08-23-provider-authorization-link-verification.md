# Provider Authorization Link Verification

Date: 2026-08-23
Branch: `codex/bs-coding-rebrand`

## Automated evidence

| Provider | Link creation | Auto-open guard | Callback/token/profile | Account/models | Result |
|---|---|---|---|---|---|
| OpenAI / ChatGPT | Mocked integration | `openExternal` remained unused | Mocked Codex OAuth token + JWT profile | OAuth account with code models | Pass |
| Antigravity IDE | Mocked integration | `openExternal` remained unused | Mocked Google token + profile + Cloud Code context | OAuth account with remote code-model catalog | Pass |
| GitHub Copilot | Mocked integration | Generic manager contract | Mocked GitHub token/profile + Copilot entitlement/token | OAuth account with code models; reconnect preserves ID | Pass |

Additional automated checks:

- Authorization session JSON excludes verifier, access token and refresh token.
- Registry rejects a visible OAuth method without an authorization strategy.
- Missing GitHub Copilot entitlement does not create an account.
- Failed model hydration rolls back new OAuth accounts and restores reconnect account credentials.
- Authorization-link construction failures release the loopback callback listener.
- Connected-session UI notifications run once per authorization `loginId`.
- Modal E2E creates and cancels two OpenAI links in one app run, proving callback listener cleanup.
- API-key mode does not render authorization actions.
- TypeScript checks passed and Vitest completed 122/122 files with 837/837 tests.
- Electron build passed and Playwright completed 13/13 tests.

## Live-account verification

| Provider | Account | Create | Copy | Open | Callback | Models | Status |
|---|---|---|---|---|---|---|---|
| OpenAI / ChatGPT | 3 accounts (identifiers omitted) | Observed | Available | Observed | Observed | Observed | PASS — user verified all accounts |
| Antigravity IDE | 1 account (identifier omitted) | Observed | Available | Observed | Observed | Observed | PASS — user verified chat and models |
| GitHub Copilot | Not supplied for this verification run | Not run | Not run | Not run | Not run | Not run | Credentials unavailable in automated run |

GitHub Copilot remains automated-only because no connected account was supplied. OpenAI and Antigravity live OAuth flows are verified; no credential or authorization URL is retained in this document.
