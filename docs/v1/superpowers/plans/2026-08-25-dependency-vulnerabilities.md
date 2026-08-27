# Dependency Vulnerability Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Bring `npm audit` to zero vulnerabilities on `master` without changing
application behaviour, then release as v1.1.3.

**Architecture:** Two independent remediations. Cluster A is a lockfile refresh
inside existing semver ranges, applied with `npm audit fix`. Cluster B is a
single `devDependencies` line change bumping `@electron/rebuild` past a semver
major. Neither adds, removes, or rewrites application source.

**Tech Stack:** npm lockfile v3, Electron 41.x, electron-builder 26,
`@electron/rebuild`, `@lydell/node-pty` native module, vitest.

## Global Constraints

- Never run `npm audit fix --force`. Every change must stay inside the declared
  semver ranges except the one explicit bump in Task 2.
- `electron` stays on the 41.x line. The target is exactly `41.10.7`. Do not
  accept 42, 43, or 44.
- `@electron/rebuild` moves from `^3.7.2` to exactly `^4.2.0` in
  `devDependencies`. No other manifest entry changes anywhere in this plan.
- Task 1 must leave `package.json` byte-identical. Only `package-lock.json`
  changes.
- Test baseline before any change: 141 test files, 962 tests passing. Any drop
  below 962 is a regression, not an acceptable variation.
- Audit baseline before any change: 15 vulnerabilities (1 critical, 8 high,
  6 moderate).
- Do not touch `src/**` in any task. If a task appears to require a source
  change, stop and report instead.

---

### Task 1: Cluster A — refresh the lockfile inside existing ranges

**Files:**
- Modify: `package-lock.json`
- Must not change: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a lockfile where `electron` resolves to 41.10.7, `undici` to 6.28.0,
  `nanoid` to 3.3.18, and the `@ai-sdk/*` family to the versions listed in the
  spec. Task 2 builds on this lockfile.

- [ ] **Step 1: Record the baseline**

```bash
npm audit
```

Expected: `15 vulnerabilities (6 moderate, 8 high, 1 critical)`.

- [ ] **Step 2: Apply the non-forced fix**

```bash
npm audit fix
```

Expected: npm reports packages added, removed, and changed. It will still print
a remaining audit report — that is Cluster B and is addressed in Task 2.

- [ ] **Step 3: Verify package.json did not change**

```bash
git diff --name-only
```

Expected: exactly `package-lock.json`. If `package.json` appears, revert with
`git checkout package.json package-lock.json` and stop — a constraint has been
violated.

- [ ] **Step 4: Verify the intended versions landed**

```bash
npm ls electron undici nanoid
```

Expected: `electron@41.10.7`. No `electron@42`, `43`, or `44` anywhere in the
output.

- [ ] **Step 5: Confirm only Cluster B remains**

```bash
npm audit
```

Expected: 3 vulnerabilities remaining, covering `tar`, `@electron/node-gyp`, and
`@electron/rebuild`. If any other package name appears, stop and report.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no diagnostics from any of the four `tsc` invocations.

- [ ] **Step 7: Test**

```bash
npm test
```

Expected: `Test Files 141 passed (141)` and `Tests 962 passed (962)`.

- [ ] **Step 8: Commit**

Stage only the lockfile, then commit with this subject and body:

```
fix(deps): refresh lockfile to clear 12 in-range advisories
```

Body: moves electron to 41.10.7, undici to 6.28.0, nanoid to 3.3.18 and the
`@ai-sdk` family to current patches; every version was already permitted by
`package.json`, so only the lockfile changes. End the message with the
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

### Task 2: Cluster B — bump `@electron/rebuild` past the major

**Files:**
- Modify: `package.json` (`devDependencies` → `@electron/rebuild`)
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the lockfile produced by Task 1.
- Produces: an audit-clean dependency tree. Task 3 rebuilds native modules
  against it.

- [ ] **Step 1: Change the one manifest line**

Edit `package.json` and change the `devDependencies` entry for
`@electron/rebuild` from `^3.7.2` to `^4.2.0`. Change nothing else in the file.

- [ ] **Step 2: Verify exactly one line changed**

```bash
git diff package.json
```

Expected: one `-` line containing `^3.7.2` and one `+` line containing `^4.2.0`.
Nothing else.

- [ ] **Step 3: Install**

```bash
npm install
```

Expected: completes without `ERESOLVE`. `@electron/rebuild` resolves to 4.2.0,
which `electron-builder` 26.15.3 already depended on, so no peer conflict is
expected.

- [ ] **Step 4: Verify the audit is clean**

```bash
npm audit
```

Expected: `found 0 vulnerabilities`. If anything remains, stop and report the
remaining advisories rather than escalating to `--force`.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no diagnostics.

- [ ] **Step 6: Test**

```bash
npm test
```

Expected: `Test Files 141 passed (141)` and `Tests 962 passed (962)`.

- [ ] **Step 7: Commit**

Stage `package.json` and `package-lock.json`, then commit with this subject:

```
fix(deps): bump @electron/rebuild to 4.2.0 to clear the tar advisory
```

Body: 3.7.2 pinned `@electron/node-gyp` to a `tar` version vulnerable to
arbitrary file creation via hardlink and symlink path traversal; 4.2.0 was
already present in the tree through `electron-builder`, and the package is a
build-time devDependency that ships in no artifact. End with the
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

### Task 3: Rebuild the native module against the new tree

**Files:** none modified. This task is a verification gate.

**Interfaces:**
- Consumes: the audit-clean tree from Task 2.
- Produces: a `@lydell/node-pty` binary built by `@electron/rebuild` 4.2.0
  against Electron 41.10.7, which Task 4 exercises at runtime.

- [ ] **Step 1: Run the same rebuild CI runs**

```bash
npx @electron/rebuild -f -w @lydell/node-pty
```

Expected: finishes with a success line and no compiler errors. This is the
riskiest step in the plan — it is the first time `@electron/rebuild` 4.2.0 and
Electron 41.10.7 are exercised together.

If it fails: stop. Do not proceed to Task 4. Report the compiler output. The
branch is revertible and nothing has been released.

- [ ] **Step 2: Confirm the built binding exists**

```bash
find node_modules/@lydell -name "*.node"
```

Expected: at least one `.node` file is listed.

---

### Task 4: Runtime verification in the running app

**Files:** none modified. This task is a manual verification gate.

**Interfaces:**
- Consumes: the rebuilt native module from Task 3.
- Produces: evidence that the terminal and the LLM streaming stack still work.

- [ ] **Step 1: Launch the app**

```bash
npm run dev
```

Expected: the log reaches `starting electron app...` with no `ERROR` lines, and
a window titled `BS Coding` appears.

- [ ] **Step 2: Open a terminal session in the app and run a command**

This exercises the `node-pty` binding rebuilt in Task 3. A working shell prompt
that echoes a typed command is the pass condition. A blank panel or a main
process crash is a failure — report it and stop.

- [ ] **Step 3: Send one chat turn and watch it stream**

This exercises the upgraded `@ai-sdk` packages and `undici` 6. Tokens appearing
incrementally is the pass condition. A stalled response, a truncated response,
or a provider error is a failure — report it and stop.

- [ ] **Step 4: Confirm provider quota still loads**

Open Settings → Providers. The Antigravity card must show percentages rather
than `unavailable`, confirming the `undici` 6 upgrade did not break the Cloud
Code fetch path fixed in v1.1.2.

- [ ] **Step 5: Stop the app**

Close the window, or stop the `electron` processes.

---

### Task 5: Release build verification

**Files:** none modified. This task is a verification gate.

**Interfaces:**
- Consumes: everything above.
- Produces: proof that packaging still succeeds before the branch is merged.

- [ ] **Step 1: Build the Windows artifacts**

```bash
npm run build:extension && npm run build:icon && npx electron-vite build && npx electron-builder --win --publish never
```

Expected: exit code 0, ending with lines building the NSIS and portable
executables.

- [ ] **Step 2: Confirm the artifacts exist**

```bash
ls -la release/*.exe
```

Expected: the setup and portable `.exe` files present with a current timestamp.
They still carry version 1.1.2 — the bump to 1.1.3 happens at release time,
after this branch is approved and merged.

- [ ] **Step 3: Report results and stop**

Do not merge, tag, bump the version, or push. Report the outcome of all five
tasks and wait for the final approval gate. Merge and release are handled after
that gate using the `superpowers:finishing-a-development-branch` skill.
