# Verify Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A release that did not fully publish leaves the workflow red, naming
what is missing, instead of green with a draft nobody can download.

**Architecture:** One shell step after `Publish release`, in the same job, that
reads what was uploaded from `artifacts/` and checks the release against it.

**Tech Stack:** GitHub Actions, bash, `gh`.

## Global Constraints

- Test baseline: **158 files, 1214 tests**. This change adds none — it is a
  workflow step, and the repo has no harness that runs workflows.
- The publish mechanism is not touched. It works; what was missing is being
  told when it did not.
- The step must be readable over clever. Its failures are read by someone at
  the end of a release, not by a machine.
- Do not tag, bump the version, or merge.
- `chore/verify-release` stays the only side branch.

---

### Task 1: The verification step

**Files:**
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Add the step after `Publish release`**

```yaml
      # v1.3.1 failed uploading one 151KB blockmap. action-gh-release creates
      # the release as a draft, uploads, and flips it to published last — so a
      # failure part-way leaves a draft holding most of the assets. A draft's
      # assets are not publicly downloadable, which is indistinguishable from
      # a finished release unless something looks: `gh release view` lists
      # latest.yml while every updater gets 404 on it.
      - name: Verify the release published
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ github.ref_name }}
          REPO: ${{ github.repository }}
        run: |
          set -euo pipefail

          if [ "$(gh release view "$TAG" --json isDraft --jq '.isDraft')" != "false" ]; then
            echo "::error::Release $TAG is still a draft. Its assets cannot be downloaded; re-run the publish job."
            exit 1
          fi

          gh release view "$TAG" --json assets --jq '.assets[].name' | sort > published.txt
          find artifacts -type f -printf '%f\n' | sort > expected.txt
          missing=$(comm -23 expected.txt published.txt)
          if [ -n "$missing" ]; then
            echo "::error::Uploaded files are missing from release $TAG:"
            echo "$missing"
            exit 1
          fi

          # The public download URL, not the API. The API reported latest.yml
          # present on v1.3.1 while this URL returned 404, and this URL is what
          # electron-updater fetches.
          while read -r file; do
            code=""
            for _ in 1 2 3 4 5; do
              code=$(curl -sL -o /dev/null -w '%{http_code}' \
                "https://github.com/$REPO/releases/download/$TAG/$file")
              if [ "$code" = "200" ]; then break; fi
              sleep 5
            done
            if [ "$code" != "200" ]; then
              echo "::error::$file is not downloadable (HTTP $code). Updaters will fail."
              exit 1
            fi
          done < <(grep -E '^latest.*\.yml$' expected.txt)

          echo "Release $TAG published with $(wc -l < expected.txt) assets."
```

Two things to get right, both of which bite silently:

- `if [ … ]; then break; fi` inside the retry loop, **not** `[ … ] && break`.
  Under `set -e` a bare `&&` list that evaluates false ends the step, so the
  retry would fail the job on its first non-200 rather than retrying.
- `comm` needs both inputs sorted, which is why each is written through `sort`.

- [ ] **Step 2: Check the file parses**

```bash
npx --yes yaml-lint .github/workflows/build.yml 2>/dev/null || python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build.yml'))"
```

Either tool is fine; the point is that a YAML error must not be discovered by
pushing a tag.

- [ ] **Step 3: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1214**, unchanged. Commit as
`ci: fail the release when it did not actually publish`.

---

### Task 2: Record it

- [ ] **Step 1: Correct the memory of what went wrong**

`docs/technical-debt.md` — no new entry. This closes the gap rather than
deferring it; note under the release process wherever it is described.

`docs/design/` — if any document describes the release process, it gains what
the guard checks and why the API is not enough. If none does, say so in the
commit rather than inventing a home for it.

- [ ] **Step 2: Verify**

```bash
npm run docs:toc && npm test
```

- [ ] **Step 3: Report and stop**

Do not merge, tag or push. Report, and say plainly that the step is unverified
until a real tag runs it — the workflow triggers on tags only, and a
`workflow_dispatch` run has no tag, so `body_path` would look for
`docs/release-notes/<branch>.md` and fail for an unrelated reason.
