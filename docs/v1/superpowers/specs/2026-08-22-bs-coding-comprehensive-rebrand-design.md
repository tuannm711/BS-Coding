# BS Coding Comprehensive Rebrand Design

**Date:** 2026-08-22
**Status:** Design approved; pending written-spec review
**Scope:** Replace the Meow brand throughout the repository with BS Coding, point releases at the current GitHub repository, and migrate existing user data without destructive overwrites.

## Goals

- Present one consistent product identity: **BS Coding**.
- Replace Meow-named production identifiers, files, configuration keys, storage keys, assets, tests, and current documentation with BS equivalents.
- Publish and update from `tuannm711/BS-Coding`.
- Preserve existing workspaces, sessions, settings, credentials, skills, tools, logs, browser data, and UI preferences through an idempotent migration.
- Leave legacy Meow literals only in the isolated migration implementation, its tests, this design record, and an explicit migration note.

## Non-goals

- Redesigning the application UI or visual identity beyond renaming existing brand assets and labels.
- Changing agent behavior, provider behavior, IPC semantics, or storage formats unrelated to branding.
- Rewriting historical implementation decisions. Historical documents may be renamed and have product references updated, but their technical meaning remains unchanged.
- Deleting legacy user data automatically after migration.

## Naming Contract

The canonical product name is `BS Coding`. Machine-readable identifiers use the following forms:

| Context | Canonical value |
|---|---|
| npm package | `bs-coding` |
| Electron product name | `BS Coding` |
| Electron app ID | `com.bs.coding` |
| GitHub owner/repository | `tuannm711/BS-Coding` |
| Native agent display name and template ID | `bs` |
| Agent/config TypeScript prefix | `Bs` |
| Settings file | `bs.json` |
| Environment override | `BS_USER_DATA` |
| Renderer storage prefix | `bs.` |
| System message prefix | `[bs]` |
| HTTP user-agent and MCP client name | `bs-coding` |
| Windows artifacts | `BS.Coding.Setup.<version>.exe`, `BS.Coding.<version>.exe` |

Internal files and symbols such as `meow-agent-manager.ts`, `MeowAgentManager`, `MeowConfig`, and `MeowSettings` become their `bs`/`Bs` equivalents. Brand-bearing asset and test filenames are renamed as well.

## Repository-wide Rebrand

The implementation updates:

- Application metadata in `package.json`, `package-lock.json`, and `electron-builder.ts`.
- Window title, tray labels, notifications, prompts, system messages, browser-extension metadata, MCP identity, and outbound user-agent strings.
- Native-agent defaults, template IDs, settings agent keys, class/type names, filenames, imports, tests, fixtures, and E2E data.
- Renderer localStorage keys and current product documentation.
- Brand-bearing screenshots and logo filenames without changing their bitmap contents as part of this task.
- GitHub URLs and Windows code-signing documentation.

A repository scan becomes an acceptance check. Outside the migration module, migration tests, this design record, and the migration note, case-insensitive `meow`/`moew` matches must be absent.

## Release Configuration

`electron-builder` publishes to:

```text
owner: tuannm711
repo: BS-Coding
```

README links, documentation-site links, release links, updater metadata, and code-signing setup instructions use the same repository. The GitHub Actions workflow remains tag-driven unless separately changed; documentation must describe its actual `v*` tag trigger accurately.

Changing `appId` from `com.meow.coding` to `com.bs.coding` creates a new OS application identity. Existing installations may require one manual installation of BS Coding rather than receiving the rebrand through the previous updater identity. This is documented in the migration/release notes.

## Migration Architecture

### Bootstrap order

Migration must run before stores, services, `BsAgentManager`, browser storage, and renderer windows are initialized. The bootstrap sequence is:

1. Resolve the canonical BS Coding user-data directory, honoring `BS_USER_DATA` first.
2. If only the legacy environment variable is present, accept it for this migration release and emit a deprecation notice.
3. Discover legacy sibling directories using explicit platform-safe candidates such as `Meow Coding` and `meow-coding`.
4. Copy missing legacy entries into the canonical directory.
5. Migrate file names and JSON content.
6. Write the migration marker only after every required migration step succeeds.
7. Construct application services and open the renderer.

The migration code is isolated in a small main-process module. Production code outside that module consumes only BS names.

### Filesystem migration

Migration copies data; it does not move or delete the legacy directory. Copy behavior is merge-only:

- Existing canonical files and directories always win.
- Missing canonical data is copied from the legacy location.
- A partially populated BS directory can be completed without overwriting newer BS data.
- The legacy source remains available for manual recovery.

This covers workspaces, sessions, snapshots, commands, permissions, logs, truncation state, traces, model catalog, encrypted vault data, browser-extension data, browser screenshots/snapshots, skills, tools, remote settings, templates, and other Electron profile data.

### Structured-data migration

After the copy, migrate known structured values:

- `meow.json` to `bs.json`, without overwriting an existing `bs.json`.
- Agent settings key/name `meow` to `bs`.
- Default/saved template ID, name, and command `meow` to `bs` where the record represents the native agent.
- Workspace agent `templateId` and native-agent name from `meow` to `bs`.

Transformations are type-aware and limited to known schemas; arbitrary user text, chat messages, prompts, command bodies, logs, and project files are not search-and-replaced.

### Renderer preference migration

On first renderer startup, each known `meow.*` localStorage key is copied to its `bs.*` counterpart only when the BS key is missing. Successfully copied legacy keys are then removed. The operation is idempotent and runs before React state initializers read preferences.

### Marker and recovery

The migration marker records the schema version and completion time. It is written atomically after success. If migration fails:

- Do not write the marker.
- Do not delete or overwrite legacy data.
- Log a clear `[bs]` diagnostic containing the failed step.
- Continue with existing canonical data when safe; otherwise start with empty BS defaults while preserving the legacy source for retry.

## Compatibility Window

For the first BS release only:

- `MEOW_USER_DATA` is accepted as a deprecated fallback when `BS_USER_DATA` is absent.
- Legacy data directories and `meow.json` are readable only by the migration module.
- Legacy template/config values are converted at load/migration boundaries.

New writes use BS identifiers exclusively. Compatibility code is not spread across services or UI components and can be removed in a later release after the migration window.

## Testing Strategy

Implementation follows test-driven development.

### Migration unit tests

- Fresh installation with no legacy data performs no copy and creates canonical defaults normally.
- Complete legacy profile is copied and transformed.
- Existing BS data is never overwritten.
- Partial migration can be retried safely.
- Marker is written only after success.
- Invalid JSON does not destroy source data and produces a recoverable failure.
- `BS_USER_DATA` takes precedence; the legacy environment variable is only a fallback.
- Settings, templates, and workspaces convert only known native-agent fields.

### Branding and configuration tests

- Default native template and agent config use `bs`.
- Package and builder metadata use BS Coding and `tuannm711/BS-Coding`.
- Application/tray/browser-extension visible labels use BS Coding.
- A repository scan permits legacy literals only in the explicit allowlist.

### Full verification

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run e2e` after a successful build when the desktop environment supports it
- `git diff --check`
- Case-insensitive legacy-brand scan with a reviewed allowlist

## Rollout and Documentation

- Add a migration note explaining the new application identity and the preserved legacy data directory.
- Document that the first BS Coding installation may be manual because the Electron app ID and release repository changed.
- Update README, active docs, documentation site, changelog template, code-signing instructions, and release links.
- Keep the old user-data directory untouched until the user chooses to remove it.

## Acceptance Criteria

- The application and repository consistently identify as BS Coding.
- Release configuration and documentation target `https://github.com/tuannm711/BS-Coding`.
- Existing Meow user data migrates once, without overwriting BS data or deleting the source.
- Native-agent identifiers, configuration, and UI preferences are converted to BS equivalents.
- Legacy literals exist only in the migration allowlist.
- Typecheck, unit/integration tests, build, and applicable E2E tests pass.
