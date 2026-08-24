# BS Coding migration

BS Coding is the renamed distribution of this application. The first BS release uses a new Electron application identity (`com.bs.coding`) and publishes from `tuannm711/BS-Coding`.

On first launch, BS Coding copies missing data from the legacy Meow Coding profile into the BS profile and converts known native-agent records (`meow` to `bs`). The legacy directory is never deleted or overwritten, so it remains available for recovery. Existing BS files always take precedence.

The migration is idempotent and writes `bs-migration.json` only after successful completion. If a profile contains invalid legacy JSON, migration stops without writing the marker and preserves the source for retry.

Use `BS_USER_DATA` to select a custom BS profile location. `MEOW_USER_DATA` is accepted only as a temporary compatibility fallback during the migration window; new deployments should use `BS_USER_DATA`.

Because the Electron app ID changed, an existing installation may require one manual installation of BS Coding before future updates are delivered through the BS release channel.

## Provider assignment migration

The first provider-architecture launch creates `assignments.json` in the BS Coding user-data directory. Existing agent provider, account, model, and speed fields are copied from `bs.json` and workspace agents. The assignment file has a schema `version` and is written through a temporary file plus atomic rename.

Before the first assignment write, BS Coding copies the current settings to `assignments.json.migration-v1.backup.json`. The backup is created once and is not overwritten on later launches. An assignment that cannot identify both a provider and a model is retained with `needs-review`; BS Coding does not substitute the first available model.

See [Provider assignment migration and recovery](provider-assignment-recovery.md) for verification and recovery steps.
