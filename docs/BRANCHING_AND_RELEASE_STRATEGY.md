# BS Coding — Branching and Release Strategy

This document defines the canonical dual-track branching, release, and auto-update strategy for BS Coding V1 and V2.

---

## 1. Canonical Topology

```text
                         BS Coding Repository
                                  │
                                 main (Repository Governance / Default)
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                V1 Track                    V2 Track
                    │                           │
               develop/v1                  develop/v2 (2.0.0 in dev)
                    │                           │
               release/v1                  release/v2 (future release branch)
                    │                           │
               v1.* tags                   v2.* tags (future releases)
```

---

## 2. Branch Roles & Rules

| Branch | Role | Product Line | Release Publishing | Tag Pattern |
|--------|------|-------------------|-------------|
| **`main`** | Repository Governance & Default Branch | Governance | **NO** | **NO** |
| **`develop/v1`** | V1 Active Development | BS Coding V1 | **NO** | **NO** |
| **`release/v1`** | V1 Stable & Maintenance Release | BS Coding V1 | **YES** | `v1.*` (from `release/v1` only) |
| **`develop/v2`** | V2 Active Development (Target: 2.0.0) | BS Coding V2 | **NO** | **NO** |
| **`release/v2`** | V2 Stable & Production Release | BS Coding V2 | **YES** *(when created)* | `v2.*` (from `release/v2` only) |

---

## 3. Governance Hard Rules

1. **MAXIMUM REMOTE BRANCHES = 5**:
   The GitHub repository must NEVER have more than 5 canonical remote branches (`main`, `develop/v1`, `release/v1`, `develop/v2`, `release/v2`).
   *(Current state: 4 remote branches before `release/v2` is established).*

2. **TEMPORARY BRANCHES ARE LOCAL-ONLY**:
   Feature, bugfix, hotfix, codex, or task branches (`feature/*`, `bugfix/*`, `hotfix/*`, `codex/*`, `task/*`, `v1/p*`, `v2/p*`) MUST remain local. Never push temporary branches to GitHub.

3. **MAIN BRANCH IS GOVERNANCE-ONLY**:
   Do NOT develop product code or trigger product releases from `main`.

4. **FORBIDDEN CROSS-VERSION MERGES**:
   Do NOT merge V1 code into V2 or V2 code into V1. `release/v1` and `develop/v2` are independent product tracks.

5. **RELEASE SOURCES**:
   - V1 releases are published exclusively from `release/v1` via `v1.*` tags.
   - V2 releases will be published exclusively from `release/v2` via `v2.*` tags once `release/v2` is established. `develop/v2` MUST NOT publish stable V2 releases.

---

## 4. Multi-Layer Auto-Update Isolation

Auto-update operates using three defensive layers:

```text
Layer 1: Update Discovery Isolation
  - Queries https://github.com/tuannm711/BS-Coding/releases.atom
  - Filters release tags for current major version (v1.* for V1, v2.* for V2)
  - Finds the highest semver tag matching current major
  - Directs electron-updater setFeedURL() to fetch update manifests directly from that tag

        ↓

Layer 2: Major-Version Guard
  - parseMajor(currentVersion) === parseMajor(updateInfo.version)
  - Rejects any update payload whose major version differs from the running app

        ↓

Layer 3: Download & Installation
  - Safe download and quitAndInstall execution
```

---

## 5. Installer Coexistence Identity

- **V1 (`release/v1`)**: `appId: 'com.bs.coding'`, Product Name: `BS Coding`
- **V2 (`develop/v2`)**: `appId: 'com.bs.coding.v2'`, Product Name: `BS Coding`, NSIS Installer: `BS.Coding.V2.Setup.${version}.exe`
- **Coexistence**: V1 and V2 use distinct `appId` identities, allowing both applications to run side-by-side on Windows, macOS, and Linux without shortcut or registry uninstallation conflicts.
