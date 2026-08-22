# BS Coding migration

BS Coding is the renamed distribution of this application. The first BS release uses a new Electron application identity (`com.bs.coding`) and publishes from `tuannm711/BS-Coding`.

On first launch, BS Coding copies missing data from the legacy Meow Coding profile into the BS profile and converts known native-agent records (`meow` to `bs`). The legacy directory is never deleted or overwritten, so it remains available for recovery. Existing BS files always take precedence.

The migration is idempotent and writes `bs-migration.json` only after successful completion. If a profile contains invalid legacy JSON, migration stops without writing the marker and preserves the source for retry.

Use `BS_USER_DATA` to select a custom BS profile location. `MEOW_USER_DATA` is accepted only as a temporary compatibility fallback during the migration window; new deployments should use `BS_USER_DATA`.

Because the Electron app ID changed, an existing installation may require one manual installation of BS Coding before future updates are delivered through the BS release channel.
