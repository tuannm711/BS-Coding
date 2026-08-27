# A release that did not publish should fail loudly — design

Date: 2026-08-27
Branch: `chore/verify-release`

## What happened

v1.3.1's `publish` job failed on one file — `BS.Coding-1.3.1-mac.zip.blockmap`,
151KB — with GitHub returning an HTML error page instead of JSON. Transient, and
a re-run fixed it.

The cost was out of proportion to the cause. `softprops/action-gh-release`
creates the release as a **draft**, uploads, and flips it to published last. A
failure part-way never reaches the flip, so the release sits as a draft holding
16 of 17 assets — and a draft's assets are not publicly downloadable.

From outside that is indistinguishable from a finished release:
`gh release view` lists `latest.yml`, while every user's updater gets **404** on
it. Which is exactly the symptom reported against v1.3.0.

**This also corrects an earlier conclusion.** I had recorded that running
`gh release create` by hand was the fault. It was badly timed — it publishes an
empty release before CI has anything to attach — but it also, accidentally, made
the release non-draft up front, so an upload failure could not strand it. Removing
it was right; it left this failure mode exposed rather than creating it.

## Approach

One step after `Publish release`, in the same job, that refuses to let the
workflow go green unless the release is actually usable. Three checks, in the
order they would fail:

1. **Not a draft.** The state that made the failure invisible.
2. **Every file that was uploaded is present as an asset.** Compared against the
   contents of `artifacts/`, which is the same set `files: artifacts/**/*`
   uploaded. This catches the actual v1.3.1 failure — one missing blockmap.
3. **Each `latest*.yml` is downloadable over the public URL.** Not the API: the
   updater fetches the release download URL, and that is the thing that was
   404ing while the API looked fine.

Check 3 retries a few times before failing. There is a short delay between an
asset being published and being served, and a check that flags that as an
outage would be a worse net than none.

Nothing about the publish mechanism changes. It worked; what was missing is
that nobody was told when it did not.

## Verification

1. The step fails when the release is a draft.
2. The step fails when an artifact file has no matching asset.
3. The step fails when a `latest*.yml` is not downloadable, after its retries.
4. The step passes on a release that published completely.
5. A real tag push reaches a green `publish` job and a published release.

The first three cannot be tested without provoking the failure, so they are
written to be readable rather than clever: explicit `::error::` lines naming
what is missing, not a silent non-zero exit.

## Risks

**It can only be exercised for real by cutting a release.** The workflow runs on
tags. The step is shell, so its logic can be read but not unit-tested here; that
is accepted for a guard whose whole job is to be simple.

**A transient 404 on the download URL could fail a good release.** Mitigated by
retries. If it proves flaky in practice the retry count is the dial, not the
check.

## Out of scope

**Retrying the upload automatically.** A failed upload should be re-run
deliberately, by someone who has seen it fail — which is what this makes
possible.

**Changing how the release is published.** Considered as option C and set aside:
the mechanism works, and rebuilding it to fix a reporting gap trades a known
quantity for an unknown one.

## Success criteria

A release that did not fully publish leaves the workflow red, naming what is
missing, instead of green with a draft nobody can download.
