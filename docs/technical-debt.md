# Technical debt

Work deliberately deferred, with the reason it was deferred and what it would
take to close. Each entry was raised while doing something else and set aside on
purpose — none of it is a forgotten TODO.

Add an entry when you decide *not* to do something you found. Remove it when the
work lands, naming the commit.

Last reviewed: 2026-08-25 (v1.1.4)

## Index

| # | Item | Area | Severity |
|---|---|---|---|
| 1 | [Test files are typechecked by nothing](#1-test-files-are-typechecked-by-nothing) | Build | High |
| 2 | [Quota reasons carry no group scope](#2-quota-reasons-carry-no-group-scope) | Providers | Medium |
| 3 | [No designed quota-health signal for routing](#3-no-designed-quota-health-signal-for-routing) | Providers | Medium |
| 4 | [`unavailableReason` is a misleading name](#4-unavailablereason-is-a-misleading-name) | Providers | Low |
| 5 | [Only two providers report usage](#5-only-two-providers-report-usage) | Providers | Medium |
| 6 | [Antigravity reports no subscription term](#6-antigravity-reports-no-subscription-term) | Providers | Won't fix |
| 7 | [Google OAuth client secret is public](#7-google-oauth-client-secret-is-public) | Security | Accepted |
| 8 | [Tray artwork is not platform-specific](#8-tray-artwork-is-not-platform-specific) | Desktop | Low |
| 9 | [opencode feature gaps](#9-opencode-feature-gaps) | Product | Medium |
| 10 | [The test runner crashes intermittently](#10-the-test-runner-crashes-intermittently) | Build | Medium |

---

## 1. Test files are typechecked by nothing

**Found:** 2026-08-25, while narrowing `ProviderUsage.status`.

No tsconfig includes `tests/`:

| Project | include |
|---|---|
| `tsconfig.node.json` | `src/main`, `src/preload`, `src/shared` |
| `tsconfig.web.json` | `src/renderer/src`, `src/shared` |
| `tsconfig.extension.json` | `src/browser-extension` |

**Why it matters, concretely.** When `'near-limit'` was removed from the
`ProviderUsage.status` union, `npm run typecheck` reported every producer in
`src/` and passed clean — while `tests/unit/quota-snapshot.test.tsx` still built
a fixture with `status: 'near-limit'`. The suite stayed green because vitest does
not typecheck. A grep caught it; the compiler could not.

The same session found a second instance: `connections-oauth.test.ts` asserted
`decodeJwtProfile` reads an `account_id` claim. The real claim key is
`chatgpt_account_id`, so the test passed for years against a function that never
worked. A typechecked fixture would not have caught that one — but it shows how
far test-encoded assumptions can drift when nothing checks them.

**To close:** add a `tsconfig.test.json` covering `tests/` with the same strictness
and path aliases, and add it to the `typecheck` script chain. Expect an initial
crop of errors in existing fixtures; each one is a fixture that has drifted from
the type it claims to model.

## 2. Quota reasons carry no group scope

**Found:** 2026-08-25, fixing the false "Quota exhausted" badge.

A 429 from one quota family is stored at account level. The message names the
model it was refused for — `"model": "claude-sonnet-4-6"` — but nothing parses
that, so `unavailableReason` and `providerError` speak for the whole account.

Three separate defects came from this single shape:

| Symptom | Fixed in |
|---|---|
| `primaryUsedPercent` pinned by a hidden helper model | v1.1.2 |
| Account-level reason printed over a healthy group | v1.1.4 |
| `providerError` badge reading "Quota exhausted" at 93.92% left | v1.1.4 |

All three were fixed at the display layer, by suppressing account-level warnings
while any window still has quota. That is correct for today and does not scale:
it can only say "some group is fine", never "which group is not".

**To close:** carry the responsible group id on the reason. This changes
`ProviderUsage`, every adapter that produces a reason, and both renderer
consumers — which is why it was deferred. Do it when the orchestrator needs to
route around a specific family rather than a whole account.

## 3. No designed quota-health signal for routing

**Found:** 2026-08-25, removing the dead `'near-limit'` status.

`ProviderUsage.status` used to carry `'near-limit'` and `'expired'`. Both were
written and never read, produced by three thresholds that disagreed with each
other — `percent >= 90`, `remaining <= 20`, `remaining <= 0.2`. The union was
narrowed to `'ok' | 'unavailable'` because those are the only values any consumer
distinguishes.

The product goal is to route work across many accounts and providers in one
session. That will need a real signal for "this account is nearly out". The
removed one is not a starting point: three disagreeing thresholds are not a
design, and reviving one would re-introduce a number nobody chose.

**To close:** pick a threshold against real routing requirements — per group or
per account, and what the router should do at each level — then add it
deliberately. See `docs/superpowers/specs/2026-08-25-dead-usage-status-design.md`
for what was removed and why.

## 4. `unavailableReason` is a misleading name

**Found:** 2026-08-25.

After the status narrowing, a 429 produces `status: 'ok'` together with
`unavailableReason: 'Quota exhausted'`. The pairing reads as a contradiction. It
is not a regression — `'near-limit'` and `unavailableReason` already coexisted on
that path — but the field is really "why the last refresh degraded", not "why
usage is unavailable".

**To close:** rename to `statusReason` across `ProviderUsage`, every adapter that
sets it, and both renderer consumers. Mechanical, wide, and worth doing alongside
item 2 rather than on its own.

## 5. Only two providers report usage

**Found:** 2026-08-25, while answering whether subscription expiry could be shown
for providers other than Antigravity.

`fetchUsage` is implemented by `antigravity.ts` and `openai.ts` only.
`github-copilot.ts` and `openai-compatible.ts` implement none, so those accounts
have no quota, no reset window and no subscription term to display — the cards
show nothing because there is nothing.

This is a design limit, not a bug, but it caps the multi-account routing goal:
the router cannot balance across providers whose remaining capacity it cannot
see.

**To close:** implement `fetchUsage` for GitHub Copilot, which does expose quota
through its own API. `openai-compatible` covers arbitrary endpoints and likely
cannot report usage in general.

## 6. Antigravity reports no subscription term

**Found:** 2026-08-25. **Status: won't fix — recorded so it is not re-investigated.**

The card shows "Subscription expiry not reported" for Antigravity because the
provider does not report one. Every key returned by `loadCodeAssist` was
captured: `cloudaicompanionProject`, `gcpManaged`, `currentTier`, `paidTier`,
`allowedTiers` and their children. No expiry, term, renewal or end-date field
exists in the response. The comparison tool shows no term for Antigravity either.

ChatGPT accounts do show a term. It comes from the `id_token` claim
`chatgpt_subscription_active_until`, not from any HTTP call.

**To close:** nothing, unless Google adds the field. Do not synthesise a term
from `g1-pro-tier`.

## 7. Google OAuth client secret is public

**Found:** 2026-08-25, via GitHub secret scanning. **Status: accepted by the owner.**

`ANTIGRAVITY_CLIENT_SECRET` in `src/main/providers/auth/antigravity-oauth.ts` is
flagged as a public leak. Measured facts:

- Google **requires** it at the token endpoint even with PKCE. A refresh without
  it returns `400 invalid_request: client_secret is missing.`
- It therefore ships inside `app.asar` of every released installer, extractable
  by anyone who downloads a release.
- It cannot be rotated: the scopes `cclog` and `experimentsandconfigs` are
  Google-internal, so this is the Antigravity IDE's own client, not one this
  project registered.

There is no configuration that keeps both the feature and the secret. Per RFC
8252 a native-app client secret is not confidential. Real exposure is not the
repo but the binary.

**The residual risk is not the leak.** It is that Google may revoke or rotate the
client, which would break the Antigravity provider for every user, and that
using a first-party client this way likely conflicts with Google's API terms.
Both are product decisions, not engineering ones.

## 8. Tray artwork is not platform-specific

**Found:** 2026-08-25, fixing the stale tray icon.

`extraResources` ships one `resources/tray-icon.png` to Windows, macOS and Linux.
macOS expects a template image that adapts to light and dark menu bars; the
current mark is a dark rounded tile that will read poorly there.

The BS wordmark is also denser than the logo it replaced, and at 32 px on a dark
taskbar it reads as a small tile rather than a clean glyph. A tray-specific
variant — glyph only, transparent background — would render better on all three.

**To close:** add per-platform tray assets and select by `process.platform` in
`TrayManager.iconPath()`. `scripts/build-windows-icon.mjs` already regenerates the
shared asset and would need to learn the variants.

## 9. opencode feature gaps

**Found:** catalogued 2026-08-05, still open.

`docs/superpowers/notes/2026-08-05-opencode-feature-diff.md` compares BS Coding
against opencode 1.18.11 and lists what is missing. The high-value group:

- Slash commands and prompt templates
- Per-message undo/redo with snapshot history
- Cost and usage stats per model, day and project
- LSP tools and diagnostics
- File watcher / auto-context
- Tool output truncation service
- LLM-generated session titles and rename
- Compaction auto-continue and prune

**To close:** each is its own task. The note is dated — verify an item is still
missing before planning it. This is the agreed next work after v1.1.4.

## 10. The test runner crashes intermittently

**Found:** 2026-08-25, twice while writing the design documentation.

`npm test` exited non-zero with `Serialized Error: { code: 'ERR_IPC_CHANNEL_CLOSED' }`
and a truncated file count, while reporting no failing assertion. Re-running
immediately gave a clean pass three times in a row, both times.

Both occurrences followed a burst of `Stop-Process` calls against Electron, so
it may be a worker-teardown race specific to this machine under load. CI has
never shown it.

**Why it matters.** The exit code is the gate before a commit. A runner that
fails for its own reasons trains you to re-run and shrug, which is exactly the
habit that lets a real failure through. It already cost one commit made against
a red run in this session.

**To close:** capture a full `--reporter=verbose` log the next time it happens
rather than re-running, and check whether vitest's `pool` or `poolOptions`
settings avoid it. Do not chase it without a captured instance.
