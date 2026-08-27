# Dependency vulnerability remediation — design

Date: 2026-08-25
Branch: `chore/dependency-vulnerabilities`
Target release: v1.1.3

## Problem

`npm audit` reports 15 vulnerabilities on `master` at v1.1.2: 1 critical, 8 high,
6 moderate. GitHub's Dependabot counts 22 because it reports per-alert rather
than per-package; the underlying set is the same.

All 15 trace to two root causes.

**Cluster A — already inside the declared semver ranges (12 vulnerabilities).**
`electron` 41.7.1, `undici` 5.29.0, `nanoid` 3.3.17 and `extract-zip` 2.0.1 are
all behind versions that `package.json` already permits. No manifest edit is
needed; the lockfile is simply stale.

**Cluster B — requires a major bump (3 vulnerabilities, including the only
critical).** `@electron/rebuild` is declared `^3.7.2`, which pins
`@electron/node-gyp` and through it a `tar` version vulnerable to arbitrary file
creation and overwrite via hardlink and symlink path traversal
(GHSA advisories on `node-tar`). The fix is `@electron/rebuild` 4.2.0, a semver
major.

## Approach

Remediate both clusters in one branch.

**Cluster A** is handled by `npm audit fix` without `--force`. The resulting
changes, confirmed by dry run, are:

| Package | From | To |
|---|---|---|
| `electron` | 41.7.1 | 41.10.7 |
| `@ai-sdk/provider-utils` | 4.0.41 | 4.0.48 |
| `@ai-sdk/anthropic` | 3.0.105 | 3.0.113 |
| `@ai-sdk/google` | 3.0.103 | 3.0.113 |
| `@ai-sdk/openai-compatible` | 2.0.63 | 2.0.72 |
| `@ai-sdk/gateway` | 3.0.163 | 3.0.181 |
| `ai` | 6.0.241 | 6.0.266 |
| `undici` | 5.29.0 | 6.28.0 |
| `nanoid` | 3.3.17 | 3.3.18 |
| `extract-zip` | 2.0.1 | replaced by `@electron-internal/extract-zip` 1.0.5 |

Every entry stays within its declared range, so only `package-lock.json`
changes. `electron` moves along the 41.x patch line — 41.x has shipped through
41.10.7 — so no Electron major migration is involved.

**Cluster B** is handled by changing one line in `devDependencies`:
`@electron/rebuild` from `^3.7.2` to `^4.2.0`.

Two facts make this lower-risk than a major bump normally is. First,
`@electron/rebuild` 4.2.0 is *already installed* in this tree —
`electron-builder` 26.15.3 depends on it — so the version is proven compatible
with this dependency graph. Second, `@electron/rebuild` is a devDependency used
only to rebuild native modules at build time (`npx @electron/rebuild -f -w
@lydell/node-pty` in CI and locally); it ships in no artifact.

## Verification

The dependency change touches the native module rebuild path and the LLM client
stack, so a green unit suite alone is not sufficient evidence.

1. `npm audit` reports 0 vulnerabilities.
2. `npm run typecheck` passes.
3. `npm test` passes — 962 tests at the current baseline.
4. `npx @electron/rebuild -f -w @lydell/node-pty` completes under the new
   4.2.0, matching what CI runs.
5. The app launches and a terminal session opens, exercising the rebuilt
   `node-pty` binding.
6. An Antigravity or OpenAI chat turn streams a response, exercising the
   upgraded `@ai-sdk/*` and `undici` stack.
7. `npx electron-builder --win --publish never` produces installable
   artifacts.

Steps 5 and 6 are manual checks in the running app. Steps 1-4 and 7 are
commands with observable output.

## Risks

**`node-pty` fails to rebuild against Electron 41.10.7 or `@electron/rebuild`
4.2.0.** This is the main risk and it surfaces at verification step 4 or 5. The
terminal panel would break. Mitigation: the failure is loud and local, and the
branch is revertible with no release consequences.

**An `@ai-sdk/*` patch changes streaming behaviour.** The chat scroll and
provider quota code read streaming events. Verification step 6 exercises this
directly.

**`undici` 5 to 6 changes fetch semantics for provider calls.** Provider
adapters call the global `fetch`, not `undici` directly, so exposure is
indirect. Step 6 covers it.

## Out of scope

**Electron 44.** Three majors ahead of 41. It resolves no advisory that 41.10.7
does not already resolve, and carries breaking API changes. If the project wants
it, that is its own branch, spec and plan.

**The dead `near-limit` field.** Unrelated cleanup, tracked separately, and
mixing it with a security patch would make both harder to review and revert.

## Success criteria

`npm audit` reports 0 vulnerabilities; all seven verification steps pass; the
change is merged to `master` and released as v1.1.3 through the existing tag
workflow.
