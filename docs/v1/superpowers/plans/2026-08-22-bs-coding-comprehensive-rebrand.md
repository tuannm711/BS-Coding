# BS Coding Comprehensive Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the Meow identity with BS Coding across production code and documentation while migrating existing user data safely and publishing releases from tuannm711/BS-Coding.

**Architecture:** Add one main-process bootstrap migration module that performs merge-only filesystem and schema migration before MainApp construction. After bootstrap, production code uses BS names only; renderer preference migration is isolated in a small helper. Rebrand metadata, symbols, files, assets, docs, tests, and release links in separate reviewable commits.

**Tech Stack:** Electron 41, React 19, TypeScript strict, Vitest, Playwright, electron-builder, Node fs/promises.

---

## File map

- Create src/main/bs-migration.ts for migration types, legacy path discovery, merge-copy, JSON transforms, marker, and environment resolution.
- Modify src/main/index.ts to run migration before stores and construct BsAgentManager; use BS environment, symbols, messages, and paths.
- Rename src/main/meow-agent-manager.ts to src/main/bs-agent-manager.ts; update class and imports.
- Create src/renderer/src/brand-storage.ts; update App.tsx and Sidebar.tsx.
- Modify package metadata, electron-builder.ts, workflow, README, active docs, extension manifest, UI labels, tests, and asset references.
- Create tests/unit/bs-migration.test.ts and tests/unit/brand-storage.test.ts.
- Create docs/bs-coding-migration.md.

## Task 1: Lock migration behavior with failing tests

Files: tests/unit/bs-migration.test.ts, tests/unit/brand-storage.test.ts.

- [ ] Write tests for fresh profile, complete legacy profile, merge without overwrite, retry after partial failure, invalid JSON preservation, marker-after-success, BS_USER_DATA precedence, and MEOW_USER_DATA fallback.
- [ ] Write schema tests proving only known native-agent fields change: meow.json to bs.json, config key meow to bs, native template id/name/command meow to bs, and workspace native templateId/name meow to bs; arbitrary prompt and log text remains unchanged.
- [ ] Write renderer storage tests for all four known meow.* keys, copy-only-when-bs-absent behavior, and deletion after successful copy.
- [ ] Run: npm test -- tests/unit/bs-migration.test.ts tests/unit/brand-storage.test.ts. Expected: FAIL because modules do not exist.
- [ ] Commit tests: git add tests/unit/bs-migration.test.ts tests/unit/brand-storage.test.ts; git commit -m "test: specify BS Coding data migration".

## Task 2: Implement bootstrap migration

Files: create src/main/bs-migration.ts; modify src/main/index.ts; test tests/unit/bs-migration.test.ts.

- [ ] Implement typed API: resolveUserDataDir(env, defaultDir) and migrateLegacyUserData(canonicalDir, options) returning userDataDir, sourceDir, migrated, markerPath.
- [ ] Use fs/promises, merge-only copy semantics, atomic marker writes, explicit JSON transforms, and never delete or overwrite legacy source.
- [ ] Run npm test -- tests/unit/bs-migration.test.ts and require all migration tests to pass.
- [ ] Wire migration before service construction and use bs.json/BS_USER_DATA afterward; keep legacy environment fallback only in migration module.
- [ ] Run npm test -- tests/unit/bs-migration.test.ts tests/unit/agent-config.test.ts tests/unit/workspace-store.test.ts tests/unit/template-manager.test.ts.
- [ ] Commit: git add src/main/bs-migration.ts src/main/index.ts tests/unit/bs-migration.test.ts; git commit -m "feat: migrate legacy Meow user data to BS Coding".

## Task 3: Rename native-agent identifiers and schemas

Files: rename src/main/meow-agent-manager.ts to src/main/bs-agent-manager.ts; modify src/main/agent/config.ts, src/main/default-templates.ts, MCP/plugin/tools files, all imports, tests, and E2E fixtures.

- [ ] Rename manager and config symbols to BsAgentManager, BsConfig, BsSettings, loadBsConfig, writeBsConfig; use bs as native key while preserving IPC channels.
- [ ] Change native default template to id/name/command bs and MCP/HTTP identities to bs-coding.
- [ ] Update tests and fixtures; only migration tests retain legacy fixtures.
- [ ] Run npm test -- tests/unit/agent-*.test.ts tests/unit/meow-agent-manager.test.ts tests/integration/agent-stream-overlap.test.ts.
- [ ] Commit: git add src tests; git commit -m "refactor: rename native agent identifiers to BS".

## Task 4: Rebrand renderer, Electron UI, extension, and assets

Files: brand-storage helper; App.tsx; Sidebar.tsx; index.html; TitleBar; tray, notifications, vault, agent messages; extension manifest; brand asset/doc/test filenames.

- [ ] Call migrateBrandStorage before React state initializers and write only bs.* preferences.
- [ ] Replace visible labels and [meow] diagnostics with BS Coding and [bs].
- [ ] Rename brand-bearing assets and update all references without changing bitmap contents.
- [ ] Run npm test -- tests/unit/*browser*.test.ts tests/unit/*chat*.test.ts tests/unit/parse-command-input.test.ts; run E2E only after build.
- [ ] Commit: git add src media docs tests; git commit -m "refactor: rebrand Electron UI and browser extension as BS Coding".

## Task 5: Update package and release configuration

Files: package.json, package-lock.json, electron-builder.ts, .github/workflows/build.yml, README.md, docs/index.html, docs/windows-code-signing.md, docs/changelog-format.md, active docs, docs/bs-coding-migration.md.

- [ ] Set package name bs-coding and regenerate lockfile with npm install --package-lock-only.
- [ ] Set appId com.bs.coding, productName BS Coding, GitHub owner tuannm711, repo BS-Coding, and BS.Coding artifact names.
- [ ] Replace repository/release URLs and document the actual tag-only v* workflow.
- [ ] Document new application identity, first-install implication, preserved legacy source, and environment fallback.
- [ ] Add static metadata assertions.
- [ ] Run npm install --package-lock-only && npm run typecheck.
- [ ] Commit: git add package.json package-lock.json electron-builder.ts .github README.md docs; git commit -m "chore: point BS Coding releases at tuannm711/BS-Coding".

## Task 6: Scan and verify

- [ ] Run the legacy scan excluding only src/main/bs-migration.ts, tests/unit/bs-migration.test.ts, the approved design spec, and docs/bs-coding-migration.md. Expected: no matches.
- [ ] Run git diff --check && npm run typecheck. Expected: exit code 0.
- [ ] Run npm test. Expected: zero failures.
- [ ] Run npm run build && npm run e2e when Electron is supported; record environmental limitations honestly.
- [ ] Run git status --short --branch and inspect the final diff.
- [ ] Commit intentional scan-only corrections with git add . && git commit -m "chore: finish BS Coding rebrand verification".

## Plan self-review

Every requirement in the approved design has a task: migration bootstrap and recovery (Tasks 1-2), identifier and schema rename (Task 3), UI/storage/assets (Task 4), release and documentation (Task 5), and acceptance scans/full verification (Task 6). No placeholder language is used; each task names files, tests, commands, and expected outcomes.
