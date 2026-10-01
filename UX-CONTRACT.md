# UI behavior ownership

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native select in AgentsTab and ModelPicker; AgentPicker for agent identity | Shared quota binding and DESIGN.md | Native provider/account/quota/model; authored agent picker | Unit filtering and Electron keyboard/selection tests |
| Form | SettingsDialog draft/saveSettings; AddProjectDialog with Modal | BsSettings and config normalization; WorkspaceStore update validation | Appearance, Agents, Quick Messages; Add/Edit project | Persistence tests and Electron create/edit/delete |
| Scrollbar | Global renderer styles.css | DESIGN.md and runtime CSS tokens | Default document baseline; bounded rail/content geometry | Static audit and Electron narrow layout |
| Toast | SettingsDialog status/error regions | Save result and IPC errors | Inline status/alert | Electron save success/failure checks |
| CRUD | SettingsDialog, AgentsTab, QuickMessagesTab, AddProjectDialog, Modal | Main-process quota and workspace validation; draft/Save/Cancel | Confirm deletion; confirm discarding dirty drafts | Electron workflows and unit rollback tests |

Settings changes remain drafts until Save. Every agent is removable. A new agent selects provider/account/quota and receives an initial model from that pool; the user may change it in chat. A quota reservation is keyed by provider/account/pool. Agent profiles are global; the same profile may be materialized in multiple projects, while distinct profiles cannot reserve the same quota.

Quick Messages send the saved content to the selected agent in the active project session. Their own row is below Mode/Agent and above the composer; each wrapping row is centered. During a running turn, guidance waits for the next step and steers that same session/execution, including a final text-only response. Pending guidance can be edited/removed. They are unavailable while a permission/question answer is required and briefly while the send is being accepted. Pending text in the composer remains independent.

Provider authorization uses AddProviderModal and AuthSessionCoordinator for loading, waiting, terminal errors and regeneration. Copilot's device variant exposes a user verification code with Copy code, the GitHub URL, Open browser, expiry and Cancel. The private device grant never crosses IPC. Cancellation or expiry prevents late requests from committing accounts; a failed reconnect restores the existing account and secrets.

Zero agents is a valid state. Config reload and background initialization must not recreate a deleted profile or discard retained session history. Legacy quota conflicts are kept for review and cannot be saved as new conflicting reservations.

Project edits retain identity and session history. A name may change during a running turn. Folder changes require all project execution (including background subagents and compaction) to be idle and project terminals closed. Validation runs in main after checking the destination directory. App metadata is rebased; project files and stored prose are not rewritten. Existing approval rules are not copied to another folder. Persistence failure rolls the session/snapshot migration back.

Appearance edits remain local to the preview until Save. Invalid HEX values disable Save and identify the field; low text contrast gets a readable warning. Cancel/discard preserves saved colors. Settings always exposes its footer at narrow/short window sizes.

Native chat progress comes from real reasoning/text/tool/prompt events. Only the last textual output of a completed turn is a final response. Copy writes its original Markdown and acknowledges success or explains failure without removing the response. Streaming, stopped and failed turns cannot claim completion. Manual scroll ownership is respected when a turn finishes.

Native final-response continuations stay in the same execution, append verbatim and cannot call tools. At most two automatic continuation requests are made after an explicit output-budget finish. A provider error, missing terminal marker or exhausted continuation budget preserves partial content with an error, never a success label. Stop is respected.

Context is the latest measured request size; session Tokens accumulates only provider-reported usage and includes cached input once. Failed/stopped turns retain measured spending. A delayed usage snapshot from another session/agent cannot overwrite the active footer. Missing usage remains unknown; configured context-budget percentages are identified separately from published model capacity.

Browser connection uses BrowserDialog/InstallGuideDialog with Modal. Helper registration is explicit and scoped to the OS user; an already-installed helper refreshes during app updates. Profile and tab selection is explicit. Native commands bind connection epoch and session owner; existing tabs cannot be claimed by another session or selected by fallback. Disable blocks reconnection until enabled. Disconnect/timeout cancels queued work and reports unknown results without replaying mutations. Corrupt browser credentials never prevent opening other app workflows.
