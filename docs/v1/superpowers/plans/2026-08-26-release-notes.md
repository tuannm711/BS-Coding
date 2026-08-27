# Release Notes Implementation Plan

Short plan, at the user's instruction. Four steps, one commit.

- [x] **Step 1: Backfill the seven releases and commit their bodies**

`gh release edit <tag> --notes-file <file>` for v1.1.1 through v1.1.7, then save
each published body to `docs/release-notes/<tag>.md` so the repository matches.

- [x] **Step 2: Add the guard**

In `tests/unit/design-docs.test.ts`, beside the typecheck-chain guard: assert
`docs/release-notes/v<package.json version>.md` exists.

- [x] **Step 3: Prove the guard fails without the file**

Move the file away, run the suite, confirm the failure names it, move it back.
A guard that has only ever been seen passing is not a guard.

- [x] **Step 4: Wire the workflow**

Add `actions/checkout@v4` to the `publish` job and
`body_path: docs/release-notes/${{ github.ref_name }}.md` to the release action.

- [x] **Step 5: Verify, merge, release**

`npm test && npm run typecheck`, merge to master, then cut a release — the only
way to prove `body_path` resolves is to publish through it.
