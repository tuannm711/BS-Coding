# Debt

Work deliberately deferred, with the reason it was deferred and what it would
take to close. Each entry was raised while doing something else and set aside on
purpose — none of it is a forgotten TODO.

Add an entry when you decide *not* to do something you found. Remove it when the
work lands, naming the commit.

This ledger belongs to the project, not to a version. **Track** says which line
of work has to close an entry: `V1-maint` is the shipped app up to the plan 20
cutover, `V2` is the rebuild, `Cross` is both.

Last reviewed: 2026-08-27

## Index

| # | Item | Area | Track | Severity |
|---|---|---|---|---|
| 1 | [No designed quota-health signal for routing](#1-no-designed-quota-health-signal-for-routing) | Providers | Cross | Medium |
| 2 | [Only two providers report usage](#2-only-two-providers-report-usage) | Providers | Cross | Medium |
| 3 | [Antigravity reports no subscription term](#3-antigravity-reports-no-subscription-term) | Providers | Cross | Won't fix |
| 4 | [Google OAuth client secret is public](#4-google-oauth-client-secret-is-public) | Security | Cross | Accepted |
| 5 | [Tray artwork is not platform-specific](#5-tray-artwork-is-not-platform-specific) | Desktop | Cross | Low |
| 7 | [The test runner crashes intermittently](#7-the-test-runner-crashes-intermittently) | Build | Cross | Medium |
| 8 | [No guard checks whether a design sentence is true](#8-no-guard-checks-whether-a-design-sentence-is-true) | Docs | Cross | Medium |
| 9 | [The balance quota model is unparsed](#9-the-balance-quota-model-is-unparsed) | Providers | Cross | Medium |
| 10 | [A process-killing test times out under full-suite load](#10-a-process-killing-test-times-out-under-full-suite-load) | Build | Cross | Low |
| 11 | [A coordinator can spend every worker's quota](#11-a-coordinator-can-spend-every-workers-quota) | Agent | Cross | Low |
| 14 | [subagentModels overlaps agents and modes](#14-subagentmodels-overlaps-agents-and-modes) | Product | Cross | Medium |
| 16 | [This release's UI was not confirmed in the app](#16-this-releases-ui-was-not-confirmed-in-the-app) | Process | V1-maint | Medium |
| 17 | [Nothing checks a documentation link any more](#17-nothing-checks-a-documentation-link-any-more) | Docs | Cross | Medium |

## Superseded

Three V1 renderer entries are not carried over, because the V2 rebuild deletes
the surfaces they describe rather than fixing them: agent bindings living in app
settings, the fleet panel showing no session tokens or cost, and sessions not
being reorderable by hand. They stay recorded as items 12, 13 and 15 of
`docs/v1/technical-debt.md`. If the V2 UI reintroduces one of those splits, open
a fresh entry here rather than reviving that one.

Item 6 of that file is closed and stays there too. It is kept for its lesson —
re-measure before planning from any summary — not as outstanding work.

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
deliberately. See `docs/v1/superpowers/specs/2026-08-25-dead-usage-status-design.md`
for what was removed and why.

---

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

---

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

---

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

---

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

---

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

---

## 8. No guard checks whether a design sentence is true

**Found:** 2026-08-25, by the opencode gap audit.

The documentation tests in `tests/unit/design-docs.test.ts` verify that a table
of contents matches its content and that every cited path exists. Neither can
evaluate a claim.

Two false statements reached `docs/design/` on the day it was written.
`02-agent-runtime.md` said compaction does not prune old tool output;
`pruneToolOutputs` exists and its own comment says it mirrors opencode's
`compaction.prune`. `05-sessions.md` said there is no redo history; `pushTurn`
is the redo path. Both sentences were written by citing V1 debt item 6
(opencode feature gaps, in `docs/v1/technical-debt.md`) rather than reading
the code — the exact failure the design documents exist to prevent.

**Third and fourth instances, 2026-08-27**, both in a *spec* rather than a
design doc, and both load-bearing for a year of decisions after them.
`2026-08-25-narrated-tool-calls-design.md` said *"the flattening itself is
necessary and must stay"* — a conclusion its own stated reasons do not support —
and *"single-agent chat is unaffected"*, which is true of the code and false of
the product, since `ChatPanel` has only one send path and it is the shared one.
Together they made the cause invisible and the blast radius look small. The
owner found it by asking why Codex, on the same accounts, never had the problem.

**Fifth instance, same day:** a *plan* asserted the pre-v1.1.6 detector
alternative was dead. Measuring the owner's store found 2 messages matching it
and 0 matching the alternative the plan proposed keeping.

**Sixth instance, 2026-08-27, and it was a *test* rather than a sentence.**
`shouldEnterManualForWheel` froze the chat transcript on any downward wheel
movement, and the suite stayed green because its test asserted that as the
intended rule — *"treats wheel movement as manual intent unless it is downward
at the exact bottom"*. A test that states a defect is the same failure as a
design sentence that states one, and it is worse: it actively defends the
defect against being noticed.

**Why it matters.** The guards are good enough to make the mechanical parts
trustworthy, which makes the prose feel trustworthy by association. A reader has
no way to tell which parts are checked. Specs and plans have no guards at all,
and four of the five instances are the kind a single measurement would have
caught.

**To close:** no clean mechanism is known. One idea — require every Known limits
sentence to name a symbol, and fail if that symbol exists in the source — was
considered and rejected as prone to false positives: a symbol can exist while the
behaviour described is still absent, which is precisely the case for
auto-continue. Until something better exists, Known limits sections are reviewed
by reading the code, and the audit that finds a drift records it here.

---

## 9. The balance quota model is unparsed

**Found:** 2026-08-26, in the same captured response.

The ChatGPT usage endpoint returns `credits.has_credits`, `credits.unlimited`,
`credits.balance`, `credits.approx_local_messages`,
`credits.approx_cloud_messages` and `spend_control.individual_limit`. None is
parsed. This is the **balance** model named in `docs/v1/design/00-goals.md`:
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
its own. Group C in `docs/v1/design/00-goals.md`.

---

## 10. A process-killing test times out under full-suite load

**Found:** 2026-08-26, during the reset credit work.

`tests/unit/agent-tools-bash.test.ts > kills the process when aborted mid-run`
timed out at its 20s limit during one `npm test` run, then passed alone and
passed on the next full run. The test spawns `ping -n 30` and asserts OS-level
process death after an abort, which on Windows means a real spawn and kill
while every other test file is running in parallel.

This is **not** item 7. That one reports `ERR_IPC_CHANNEL_CLOSED` with a
truncated file count and no failing assertion; this is a clean timeout on one
named test.

**Why it matters.** Same reason as item 7: a suite that fails for its own
reasons trains you to re-run and shrug. Before re-running, this instance was
checked against the change in flight and found unrelated — the file passes
alone, and the failure is in process teardown, not in anything the change
touched.

**To close:** decide whether the 20s budget is right for a Windows spawn-and-
kill under parallel load, or whether this test should run in its own pool.
Do not simply raise the number without knowing which.

---

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

---

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

---

## 17. Nothing checks a documentation link any more

**Found:** 2026-08-27, while consolidating the project rules.

`tests/unit/design-docs.test.ts`, `scripts/build-docs-toc.mjs` and the
`docs:toc` npm script were deleted by commit `0c327ff`. Between them they were
the only mechanical guard in the repository that a table of contents matched its
content and that every path a document cited existed.

They were deleted in the same commit that took in `docs/v2/`: 34 architecture
documents carrying `depends_on` fields, a `MANIFEST.txt`, twenty implementation
plans, and relative links throughout. None of it is checked by anything.

**Why it matters.** This is item 8 one notch worse. Item 8 records that no guard
can tell whether a design sentence is *true*; the mechanical half — does this
path exist, does this index match — was at least verified, which is what made
the prose feel trustworthy by association. Now neither half is.

**To close:** decide what the guard covers before writing one. The retired test
encoded V1 conventions that `docs/v2/` does not follow, so restoring it verbatim
would fail on a pack that is correct. A link-existence check across all of
`docs/` is the smaller, honest starting point.
