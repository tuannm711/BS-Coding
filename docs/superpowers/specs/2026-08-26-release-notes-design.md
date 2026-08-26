# Release notes on GitHub — design

Date: 2026-08-26
Branch: `ci/release-notes`

Short spec: the user asked for this to be done briefly, so the phương án,
spec and plan gates were collapsed into one pass at their instruction.

## Problem

Every release from v1.1.1 to v1.1.7 published with an empty body. The cause is
structural, not forgetfulness: the `publish` job in `.github/workflows/build.yml`
has no `actions/checkout`, so it cannot read any file in the repository, and
`softprops/action-gh-release@v2` is given only `files`.

## Approach

A short notes file per release at `docs/release-notes/v<version>.md`, read by the
publish job through `body_path: docs/release-notes/${{ github.ref_name }}.md`,
with `actions/checkout@v4` added so the file is present.

Separate from `docs/changelog-<version>.md`, which is detailed and is what the
app displays. The GitHub body is the short form; two purposes, two files.

Not `generate_release_notes: true` — that produces a raw commit list, which is a
log rather than a changelog.

Two guards, because `body_path` alone fails only after the full build:

1. A test asserting that `docs/release-notes/v<package.json version>.md` exists.
   `npm test` goes red the moment a version is bumped without notes.
2. `body_path` itself, which catches a file deleted later or a tag pushed from
   another machine.

The seven existing releases are backfilled, and their published bodies are
committed so the repository and GitHub agree.

## Verification

1. The guard fails when the notes file for the current version is missing —
   checked by removing it, not by assuming.
2. `npm test` and `npm run typecheck` pass.
3. The next release publishes with the body from its notes file. This is the
   only end-to-end proof, and is the reason the change ships as a release rather
   than sitting on master.

## Out of scope

`docs/changelog-*.md` and how the app reads them. The `test` and `build` jobs.
No new dependency.
