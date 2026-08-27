# Technical debt

Work deliberately deferred, with the reason it was deferred and what it would
take to close. Each entry was raised while doing something else and set aside on
purpose — none of it is a forgotten TODO.

Add an entry when you decide *not* to do something you found. Remove it when the
work lands, naming the commit.

Last reviewed: 2026-08-27 (at the v1.3.0 release)

## Index

| # | Item | Area | Severity |
|---|---|---|---|
| 1 | [No designed quota-health signal for routing](#1-no-designed-quota-health-signal-for-routing) | Providers | Medium |
| 2 | [Only two providers report usage](#2-only-two-providers-report-usage) | Providers | Medium |
| 3 | [Antigravity reports no subscription term](#3-antigravity-reports-no-subscription-term) | Providers | Won't fix |
| 4 | [Google OAuth client secret is public](#4-google-oauth-client-secret-is-public) | Security | Accepted |
| 5 | [Tray artwork is not platform-specific](#5-tray-artwork-is-not-platform-specific) | Desktop | Low |
| 6 | [opencode feature gaps](#6-opencode-feature-gaps) | Product | Medium |
| 7 | [The test runner crashes intermittently](#7-the-test-runner-crashes-intermittently) | Build | Medium |
| 8 | [No guard checks whether a design sentence is true](#8-no-guard-checks-whether-a-design-sentence-is-true) | Docs | Medium |
| 9 | [The balance quota model is unparsed](#9-the-balance-quota-model-is-unparsed) | Providers | Medium |
| 10 | [A process-killing test times out under full-suite load](#10-a-process-killing-test-times-out-under-full-suite-load) | Build | Low |
| 11 | [A coordinator can spend every worker's quota](#11-a-coordinator-can-spend-every-workers-quota) | Agent | Low |
| 12 | [Agent bindings live in app settings](#12-agent-bindings-live-in-app-settings) | UI | Medium |
| 13 | [Fleet shows no session tokens or cost](#13-fleet-shows-no-session-tokens-or-cost) | UI | Low |
| 14 | [subagentModels overlaps agents and modes](#14-subagentmodels-overlaps-agents-and-modes) | Product | Medium |
| 15 | [Sessions cannot be reordered by hand](#15-sessions-cannot-be-reordered-by-hand) | UI | Low |
| 16 | [This release's UI was not confirmed in the app](#16-this-releases-ui-was-not-confirmed-in-the-app) | Process | Medium |

---

## 1. No designed quota-health signal for routing

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





## 2. Only two providers report usage

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





## 3. Antigravity reports no subscription term

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





## 4. Google OAuth client secret is public

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





## 5. Tray artwork is not platform-specific

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





## 6. opencode feature gaps — closed

**Found:** catalogued 2026-08-05. **Re-measured and closed 2026-08-25** — see
`docs/superpowers/audits/2026-08-25-opencode-gap-audit.md`, which supersedes the
note this entry used to summarise.

Of the eight high-value items, five are built and three are partly built. What
remains, in the order the audit recommends:

1. **A stats surface.** `calcCost` and `StatsSummary` are computed in
   `src/main/bs-agent-manager.ts` and read by nothing in `src/renderer`. The
   numbers exist and cannot be seen. Cheapest item, and it serves routing: what
   an account has cost is the other half of what quota it has left.
2. **Compaction robustness.** Both halves of the original item are built:
   `pruneToolOutputs` prunes, and `compactIfOverThreshold` runs in-loop so the
   turn continues. What remains is a cap and a blind spot — `MAX_COMPACT_PER_RUN`
   is 2, past which the turn proceeds over the limit, and a provider rejection
   for length is not recovered from.
3. **LLM session titles.** Renaming works; the automatic title is still the
   `titleFrom` heuristic.
4. **Message-granular undo.** `undoTurn` and `pushTurn` give turn-granular undo
   and redo. Going finer needs an identity below `turnId` in the transcript.

**Closed.** All four landed in `feat/close-opencode-gaps`; the audit records
which commit carried each. Kept as an entry because of how it went wrong: this
summary was written from a note rather than the code and was wrong twice, in the
same direction both times — claiming something absent that was partly present.
Re-measure before planning from any summary, including this one.





## 7. The test runner crashes intermittently

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





## 8. No guard checks whether a design sentence is true

**Found:** 2026-08-25, by the opencode gap audit.

The documentation tests in `tests/unit/design-docs.test.ts` verify that a table
of contents matches its content and that every cited path exists. Neither can
evaluate a claim.

Two false statements reached `docs/design/` on the day it was written.
`02-agent-runtime.md` said compaction does not prune old tool output;
`pruneToolOutputs` exists and its own comment says it mirrors opencode's
`compaction.prune`. `05-sessions.md` said there is no redo history; `pushTurn`
is the redo path. Both sentences were written by citing debt item 7 (opencode feature gaps) rather than
reading the code — the exact failure the design documents exist to prevent.

**Why it matters.** The guards are good enough to make the mechanical parts
trustworthy, which makes the prose feel trustworthy by association. A reader has
no way to tell which parts are checked.

**To close:** no clean mechanism is known. One idea — require every Known limits
sentence to name a symbol, and fail if that symbol exists in the source — was
considered and rejected as prone to false positives: a symbol can exist while the
behaviour described is still absent, which is precisely the case for
auto-continue. Until something better exists, Known limits sections are reviewed
by reading the code, and the audit that finds a drift records it here.




## 9. The balance quota model is unparsed

**Found:** 2026-08-26, in the same captured response.

The ChatGPT usage endpoint returns `credits.has_credits`, `credits.unlimited`,
`credits.balance`, `credits.approx_local_messages`,
`credits.approx_cloud_messages` and `spend_control.individual_limit`. None is
parsed. This is the **balance** model named in `docs/design/00-goals.md`:
credit that depletes and is topped up by hand rather than refilling on a
schedule.

`ProviderQuotaWindow` cannot express it. Every field on it is built around a
reset time, and a balance has none.

**Why it matters.** It was assumed this model could not be designed until a
DeepSeek account existed to measure. That assumption was wrong — the shape is
already returned by a provider in daily use, on an account whose balance is
currently zero.

**To close:** design the balance model against this response, then decide
whether a top-up provider such as DeepSeek maps onto the same shape or needs
its own. Group C in `docs/design/00-goals.md`.



## 10. A process-killing test times out under full-suite load

**Found:** 2026-08-26, during the reset credit work.

`tests/unit/agent-tools-bash.test.ts > kills the process when aborted mid-run`
timed out at its 20s limit during one `npm test` run, then passed alone and
passed on the next full run. The test spawns `ping -n 30` and asserts OS-level
process death after an abort, which on Windows means a real spawn and kill
while every other test file is running in parallel.

This is **not** item 8. That one reports `ERR_IPC_CHANNEL_CLOSED` with a
truncated file count and no failing assertion; this is a clean timeout on one
named test.

**Why it matters.** Same reason as item 8: a suite that fails for its own
reasons trains you to re-run and shrug. Before re-running, this instance was
checked against the change in flight and found unrelated — the file passes
alone, and the failure is in process teardown, not in anything the change
touched.

**To close:** decide whether the 20s budget is right for a Windows spawn-and-
kill under parallel load, or whether this test should run in its own pool.
Do not simply raise the number without knowing which.


## 11. A coordinator can spend every worker's quota

**Found:** 2026-08-26, in the same spec.

A plan that fans out to five agents runs five turns against five quota pools.
Nothing limits how many an agent may assign, or how often.

**Why it matters.** Less than it sounds, which is why it is Low: the quota cards
make the spend visible, and A2's fallback means an exhausted pool is routed
around rather than hit repeatedly. But an agent deciding how much of the user's
quota to spend is a new thing in this product.

**Deliberately not capped.** An arbitrary limit would be a number nobody chose,
which is the mistake debt item 1 recorded when three disagreeing thresholds were
removed. **To close:** decide what the limit is *for* — a per-turn budget, a
count, a confirmation above some size — before picking a number.

---

## 12. Agent bindings live in app settings

**Found:** 2026-08-26, while moving the fleet panel into place.

`Settings → Agents` binds a provider, account and model to each agent. Those are
properties of the **project** — which agents exist, what each one runs — sitting
in an **app**-scoped dialog beside MCP servers and update preferences.

The fleet panel is now the project surface: it lists every agent, what it runs
and which pool it draws on, and it is where the coordinator role is given. The
binding belongs there too, next to what it produces.

**Why it matters.** Two places answer "what does this agent run", and the one a
person reaches for — the roster they are already reading — is not the one that
can change it. That is the same split that put Coordinate in the chat mode row.

**Deliberately deferred.** Moving the binding means moving the account picker,
the model picker and their validation with it, which is its own piece of work
rather than a tail on this one. **To close:** move the per-agent binding into
the fleet row, and leave Settings holding only what is genuinely app-wide.

## 13. Fleet shows no session tokens or cost

**Found:** 2026-08-26, the same day.

The pinned quota block passed per-agent telemetry — session tokens and estimated
cost — into the account card, gathered from `chat` events. The fleet panel does
not subscribe to those events, so its cards render without the session metrics
the chat variant showed.

**Why it matters.** Low. The numbers are still in the Usage tab, and the quota
bars — the thing the panel exists for — are unaffected. But a reading that used
to be one glance away now is not.

**The card no longer pretends otherwise.** It rendered the metrics row anyway,
producing four truncated labels over four dashes at panel width. The fleet
variant now renders no metrics row: an absent measurement is better shown as
absent than as a heading with nothing under it.

**To close:** carry telemetry into `buildFleet` the way `buildQuotaRows` carries
it, or decide the panel is about quota rather than spend and say so in the
design doc instead.

---

## 14. subagentModels overlaps agents and modes

**Found:** 2026-08-26, raised repeatedly and never settled.

`subagentModels` configures which model an anonymous `task` subagent runs. Since
`delegate`, `mode` and now `worker` arrived, it is a fourth thing answering a
question the other three already share: which of the user's agents does a piece
of work, and on what.

**Why it matters.** Medium. It still works, but it is configuration nobody
reaches for, describing a mechanism the coordination design routes around —
`task` is denied to a coordinator, and denied to a worker while it carries an
assignment.

**Undecided, and the owner's to decide.** Either fold it into the agent model,
or state what it is for that agents-and-modes does not cover. **To close:**
decide that, then act on it.

## 15. Sessions cannot be reordered by hand

**Found:** 2026-08-27, raised by the owner while moving sessions into the
sidebar and not decided.

The list orders by creation, newest first, and holds still — which fixed the
worse problem of the list rearranging itself as it was used. The owner asked
whether entries could be dragged into an order of their own.

**Why it matters.** Low. Nothing is unreachable; a long-lived project simply
accumulates sessions in an order it did not choose.

**To close:** decide whether hand-ordering is wanted, and if so where the order
is stored — the session, or a per-project list.

## 16. This release's UI was not confirmed in the app

**Found:** 2026-08-27, at the release itself.

Four things shipped without the owner reporting back on them: whether each
coordination tile scrolls inside its own box rather than stretching its grid
row; whether fleet agents now appear under their pool rather than in the
"No quota reported" section; whether switching session is quick after the
session store gained a cache; and whether switching project paints immediately.

Each is covered by tests, and tests are what caught the pool grouping being
dead in the app while the suite was green — on a fixture that spelled out
`modelIds` the provider never sends. So a green suite is not the confirmation
this needs.

**Why it matters.** Medium, and only until someone looks. **To close:** exercise
the four in the app and either close this or open what it turns up.
