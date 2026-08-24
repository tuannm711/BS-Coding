# Provider assignment migration and recovery

BS Coding stores provider accounts and agent assignments separately:

- `connections/accounts.json` contains safe account metadata; secrets remain in `connections/vault.json` and are never exposed to the renderer.
- `assignments.json` is the canonical mapping from a workspace agent ID to provider, account, model, speed, status, and revision.
- `bs.json` still contains named agent profiles and system prompts.
- `assignments.json.migration-v1.backup.json` is a one-time copy of `bs.json` made before the first assignment write.

All paths are relative to the Electron user-data directory. A custom directory may be selected with `BS_USER_DATA`.

## Expected migration behavior

1. BS Coding reads existing named agent profiles and workspace agent records.
2. It writes every exact provider/account/model/speed combination to `assignments.json` with schema version `1`.
3. It writes the settings backup once, using a temporary file and atomic rename.
4. Complete references become `ready`. Incomplete references become `needs-review` and remain visible in Settings.
5. Reopening Settings or restarting the app reads the exact saved model ID; no first-model fallback is performed.

## Verify a migrated profile

1. Open Settings → Agents.
2. Confirm Provider, Account, Model, and Speed match the previous profile.
3. Select a non-first model and save.
4. Close and reopen Settings, then restart the app and workspace.
5. Confirm the same model remains selected and the right-panel quota card lists that model.

If an option is marked `needs review`, reconnect or refresh the account, then explicitly select one of the account's offered models and save. This state is intentional and does not indicate lost credentials.

## Recover settings or assignments

Close BS Coding before changing user-data files.

- To restore pre-migration named agent settings, make a safety copy of the current `bs.json`, then copy `assignments.json.migration-v1.backup.json` over `bs.json`.
- To rebuild only canonical assignments, make a safety copy of `assignments.json`, remove the original, and start BS Coding. Migration runs again from `bs.json` and workspace agents. The original migration backup remains unchanged.
- To recover an account connection, use Settings → Providers → Reconnect. Do not copy tokens or API keys into `assignments.json`; it contains no secrets.
- If model refresh fails but credentials and quota refresh succeed, the provider card shows the Models stage as `error` and retains the last valid model catalog.

Never edit `connections/vault.json` manually. If account metadata and Vault references no longer match, remove and reconnect only the affected account from the Providers dashboard.
