# BS Coding 2.0.0 Release Checklist

This checklist prepares and verifies a release. It does not authorize a push,
tag, or GitHub release. Publish only by pushing the approved `v2.0.0` tag after
all rows below are complete.

## 1. Source and acceptance gates

- [ ] Working tree is clean and the release commit is on local `master`.
- [ ] Every row in `docs/v2/acceptance-matrix.md` is `PASS`.
- [ ] `npm ci`
- [ ] `npx @electron/rebuild -f -w @lydell/node-pty`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run e2e`

No automated test may call a real provider/model.

## 2. Migration dry run on copied V1 data

- [ ] Close BS Coding so the source is stable.
- [ ] Copy the real V1 `userData` directory to a disposable directory.
- [ ] Launch the 2.0.0 build with `BS_USER_DATA` pointing only to that copy.
- [ ] Confirm `v1-backups/v1-backup-*/manifest.json` exists before using V2.
- [ ] Verify every manifest SHA-256 against its copied source file.
- [ ] Open `v2/state.sqlite` read-only and confirm `cutover_state.id = 'global'`.
- [ ] Confirm the persisted migration report has `validated=true` and no errors.
- [ ] Relaunch against the same copy and confirm counts do not change.
- [ ] Confirm raw secret bytes exist only in the encrypted vault/backup, never in
  `provider_accounts`, canonical events, logs, or renderer DTOs.
- [ ] Confirm the original V1 `sessions.json` remains unchanged/read-only.

If validation fails, do not continue. Preserve the backup and copied source for
diagnosis; never retry against the user's only V1 data copy.

## 3. Prototype and packaged smoke

- [ ] Home, Projects, Work, Agents and Settings are the only primary nav items.
- [ ] Work exposes Conversation, Plan, Tasks, Execution, Changes and Review.
- [ ] Pause/resume/cancel, runtime switch and review→rework flows match the
  vendored prototype under `docs/v2/prototype/figma-make/`.
- [ ] Updates channel/check and Remote Control enable/pair/revoke work through
  `window.bs.v2`; `window.api` is absent in the V2 production renderer.
- [ ] Run `npm run dist` on Windows and smoke the NSIS/portable artifacts.
- [ ] Run `npm run dist:mac` on macOS and smoke DMG/ZIP artifacts.
- [ ] Run `npm run dist:linux` on Linux and smoke AppImage/DEB artifacts.
- [ ] Verify app start, migration, restart recovery, updater metadata and clean
  process-tree shutdown on each supported platform.

## 4. Release metadata and public assets

- [ ] `package.json` and `package-lock.json` both report `2.0.0`.
- [ ] `docs/release-notes/v2.0.0.md` is final and English.
- [ ] CI build artifacts contain installers, blockmaps and every `latest*.yml`.
- [ ] Windows signatures are valid when signing credentials are configured.
- [ ] After explicit release approval, push the `v2.0.0` tag; do not run
  `gh release create` manually.
- [ ] Confirm the GitHub release is not a draft.
- [ ] Compare uploaded asset names with downloaded CI artifact names after
  GitHub filename normalization.
- [ ] Fetch every public `latest*.yml` URL and require HTTP 200.
- [ ] Download one installer/update artifact from the public release URL and
  verify its checksum before declaring the release complete.

Rollback: stop distribution, keep the V1 archive and V2 database, and restore
the previous signed installer. Never enable V1 and V2 mutable session writers
simultaneously.
