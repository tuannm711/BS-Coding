# UI behavior ownership

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native select in AgentsTab and ModelPicker; AgentPicker for agent identity | Shared quota binding and DESIGN.md | Native provider/account/quota/model; authored agent picker | Unit filtering and Electron keyboard/selection tests |
| Form | SettingsDialog draft and saveSettings | BsSettings and config normalization | Agents and Quick Messages | Persistence tests and Electron create/edit/delete |
| Scrollbar | Global renderer styles.css | DESIGN.md and runtime CSS tokens | Default document baseline; bounded rail/content geometry | Static audit and Electron narrow layout |
| Toast | SettingsDialog status/error regions | Save result and IPC errors | Inline status/alert | Electron save success/failure checks |
| CRUD | SettingsDialog, AgentsTab, QuickMessagesTab, Modal | Main-process quota validation; draft/Save/Cancel | Confirm deletion; confirm discarding dirty drafts | Electron workflows and unit rollback tests |

Settings changes remain drafts until Save. Every agent is removable. A new agent selects provider/account/quota and receives an initial model from that pool; the user may change it in chat. A quota reservation is keyed by provider/account/pool. Agent profiles are global; the same profile may be materialized in multiple projects, while distinct profiles cannot reserve the same quota.

Quick Messages send the saved content to the selected agent in the active project session. They can queue during a running turn. They are unavailable while a permission/question answer is required and briefly while the send is being accepted. Pending text in the composer remains independent.

Zero agents is a valid state. Config reload and background initialization must not recreate a deleted profile or discard retained session history. Legacy quota conflicts are kept for review and cannot be saved as new conflicting reservations.
