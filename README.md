# BS Coding

BS Coding is an Electron desktop app for managing parallel coding agent sessions.

## Branching Architecture

This repository maintains two independent product tracks operating in parallel.
**Do not develop product code directly on `main`.**

- **V1 Track**:
  - Development: `develop/v1`
  - Stable / Release: `release/v1`
  - Release Tags: `v1.*`

- **V2 Track (2.0.0 in development)**:
  - Development: `develop/v2`
  - Stable / Release: `release/v2` (to be created when 2.0.0 is ready)
  - Release Tags: `v2.*`

For full details, see [`docs/BRANCHING_AND_RELEASE_STRATEGY.md`](docs/BRANCHING_AND_RELEASE_STRATEGY.md).
