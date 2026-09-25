# BS Coding — Branching and Release Strategy

BS Coding is a single-track repository. The former V2 track moved on 2026-09-25 to the
separate product **BS Workflow** (`tuannm711/BS-Workflow`), which has its own branches,
releases, update feed and install identity.

---

## 1. Topology

```text
BS Coding Repository
        │
       main (Repository Governance / Default)
        │
   develop/v1 ── development
        │
   release/v1 ── release
        │
    v1.* tags ── published releases
```

---

## 2. Branch Roles & Rules

| Branch | Role | Release Publishing | Tag Pattern |
|--------|------|--------------------|-------------|
| **`main`** | Repository Governance & Default Branch | **NO** | **NO** |
| **`develop/v1`** | Active development | **NO** | **NO** |
| **`release/v1`** | Stable & maintenance releases | **YES** | `v1.*` (from `release/v1` only) |

---

## 3. Governance Hard Rules

1. **MAXIMUM REMOTE BRANCHES = 3**: `main`, `develop/v1`, `release/v1`.
2. **TEMPORARY BRANCHES ARE LOCAL-ONLY**: feature, bugfix, hotfix, codex or task branches
   (`feature/*`, `bugfix/*`, `hotfix/*`, `codex/*`, `task/*`, `v1/p*`) MUST remain local.
3. **MAIN BRANCH IS GOVERNANCE-ONLY**: do not develop product code or trigger releases from `main`.
4. **NO V2 BRANCHES HERE**: V2 work lives in BS Workflow. Do not recreate `develop/v2` or
   `release/v2`, and do not merge BS Workflow code into this repository.
5. **RELEASE SOURCE**: releases are published exclusively from `release/v1` via `v1.*` tags.
   Merging `develop/v1` into `release/v1` can overwrite `release/v1`'s tag-publish `build.yml` —
   verify `on: push: tags: ['v1.*']` survives before tagging.

---

## 4. Auto-Update

```text
Layer 1: Update Discovery
  - Queries https://github.com/tuannm711/BS-Coding/releases.atom
  - Keeps release tags with the running app's major version
  - Points electron-updater setFeedURL() at the highest matching tag

Layer 2: Major-Version Guard
  - Rejects any update payload whose major version differs from the running app

Layer 3: Download & Installation
```

BS Workflow publishes to its own repository, so BS Coding never sees its releases.

---

## 5. Coexistence with BS Workflow

| | BS Coding | BS Workflow |
|---|---|---|
| appId / AppUserModelID | `com.bs.coding` | `com.bs.workflow` |
| userData (Windows) | `%APPDATA%\bs-coding` | `%APPDATA%\bs-workflow` |
| Browser bridge port | 3927 | 3937 |
| Dev server port | 1305 | 1306 |
| Update source | BS-Coding releases | BS-Workflow releases |

Both apps can be installed and run at the same time; neither reads or writes the other's data.
