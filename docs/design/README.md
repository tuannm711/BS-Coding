# BS Coding — design reference

BS Coding is an Electron desktop app that runs several CLI coding agents side by
side in terminal panes, alongside a native agent with its own chat surface. Its
purpose is to drive many accounts across many providers inside one coding
session. For the product view — features, screenshots, how to install — read
`README.md` at the repository root; this directory is the technical reference.

**Start with [Goals](00-goals.md).** These documents describe how the code
behaves; that one describes what it is trying to become, and is what a proposal
should be checked against.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [How the domains relate](#how-the-domains-relate) | 25-41 | `LlmClient` |
| [The documents](#the-documents) | 42-59 |  |
| [Finding a name](#finding-a-name) | 60-235 | `.cmd`, `.exe`, `.github/workflows/build.yml`, `.ico`, `'near-limit'`, `/bin/bash` |
| [What is here and what is history](#what-is-here-and-what-is-history) | 236-245 | `docs/design/`, `docs/superpowers/`, `docs/evidence/` |
| [Current work](#current-work) | 246-257 | `tests/`, `statusReason`, `docs/superpowers/specs/2026-08-25-narrated-tool-calls-design.md` |
| [Next work](#next-work) | 258-271 |  |
| [Debt](#debt) | 272-278 | `docs/technical-debt.md` |
<!-- /toc -->

## How the domains relate

The three Electron processes are the outermost boundary, and everything else
lives inside one of them.

In the **main process**: the agent runtime drives a turn and calls tools; the
providers layer supplies it with an `LlmClient` and decides which account can
take that turn; sessions record what happened; pty management runs the external
CLI agents. In the **renderer**: the UI shell frames all of it. Around both:
build and release turn the tree into installers, and remote control exposes a
narrow slice to a phone.

Two of these are load-bearing for the product goal in ways that are easy to
miss. **Providers** decides account selection, so quota accuracy is correctness
rather than presentation. **Sessions** holds the lock that lets several agents
share one conversation without interleaving.

## The documents

| # | Document | Subject |
|---|---|---|
| 00 | [Goals](00-goals.md) | What the product is for, the two execution modes, the vocabulary, the work groups |
| 01 | [Process model](01-process-model.md) | The three processes, the IPC contract, the build projects |
| 02 | [Agent runtime](02-agent-runtime.md) | The turn loop, tools, permissions, compaction, MCP and LSP |
| 03 | [Providers](03-providers.md) | Adapters, OAuth and the vault, the quota model, account selection |
| 04 | [Terminal panes](04-terminal-panes.md) | pty lifecycle, the xterm host, teardown without orphans |
| 05 | [Sessions](05-sessions.md) | Transcripts, the shared-session lock, snapshots, artifacts |
| 06 | [UI shell](06-ui-shell.md) | Window chrome, sidebar, right panel, settings, tray |
| 07 | [Build and release](07-build-release.md) | Packaging, signing, the tag-driven workflow, updates |
| 08 | [Remote control](08-remote-control.md) | The relay, pairing, the command gate |

Every document opens with a generated table of contents giving each section's
line range and the names it mentions, so one section can be read on its own
without loading the file around it.

## Finding a name

Generated from every domain document: which one introduces a name, and where.

<!-- names -->
| Name | Where | Line |
| --- | --- | --- |
| `.cmd` | [04-terminal-panes.md#design-decisions](04-terminal-panes.md#design-decisions) | 59 |
| `.exe` | [04-terminal-panes.md#design-decisions](04-terminal-panes.md#design-decisions) | 59 |
| `.github/workflows/build.yml` | [07-build-release.md#pieces](07-build-release.md#pieces) | 17 |
| `.ico` | [07-build-release.md#data-flow](07-build-release.md#data-flow) | 29 |
| `'near-limit'` | [03-providers.md#design-decisions](03-providers.md#design-decisions) | 81 |
| `/bin/bash` | [04-terminal-panes.md#known-limits](04-terminal-panes.md#known-limits) | 91 |
| `$SHELL` | [04-terminal-panes.md#known-limits](04-terminal-panes.md#known-limits) | 91 |
| `0N-*.md` | [00-goals.md#what-this-document-is-not](00-goals.md#what-this-document-is-not) | 167 |
| `adapter.fetchUsage` | [03-providers.md#data-flow](03-providers.md#data-flow) | 37 |
| `adapter.refreshCredentials` | [03-providers.md#data-flow](03-providers.md#data-flow) | 37 |
| `AgentApi` | [01-process-model.md#pieces](01-process-model.md#pieces) | 18 |
| `AgentStateEvent` | [01-process-model.md#types-that-carry-it](01-process-model.md#types-that-carry-it) | 54 |
| `antigravity.ts` | [03-providers.md#known-limits](03-providers.md#known-limits) | 124 |
| `app.setAppUserModelId` | [06-ui-shell.md#design-decisions](06-ui-shell.md#design-decisions) | 61 |
| `App.tsx` | [06-ui-shell.md#data-flow](06-ui-shell.md#data-flow) | 32 |
| `appendMessage` | [02-agent-runtime.md#types-that-carry-it](02-agent-runtime.md#types-that-carry-it) | 67 |
| `appendTool` | [02-agent-runtime.md#types-that-carry-it](02-agent-runtime.md#types-that-carry-it) | 67 |
| `appId` | [07-build-release.md#types-that-carry-it](07-build-release.md#types-that-carry-it) | 46 |
| `ArtifactStore` | [05-sessions.md#known-limits](05-sessions.md#known-limits) | 100 |
| `bankedLimit` | [00-goals.md#group-b-the-quota-surface](00-goals.md#group-b-the-quota-surface) | 137 |
| `bankedUsed` | [00-goals.md#group-b-the-quota-surface](00-goals.md#group-b-the-quota-surface) | 137 |
| `BsAgentManager` | [02-agent-runtime.md#pieces](02-agent-runtime.md#pieces) | 18 |
| `buffersRef` | [06-ui-shell.md#data-flow](06-ui-shell.md#data-flow) | 32 |
| `build/icons/32x32.png` | [07-build-release.md#design-decisions](07-build-release.md#design-decisions) | 58 |
| `buildSpawnCommand` | [04-terminal-panes.md#design-decisions](04-terminal-panes.md#design-decisions) | 59 |
| `Channels.EventPtyData` | [04-terminal-panes.md#data-flow](04-terminal-panes.md#data-flow) | 29 |
| `Channels.EventRemoteStatus` | [08-remote-control.md#data-flow](08-remote-control.md#data-flow) | 30 |
| `Channels` | [01-process-model.md#types-that-carry-it](01-process-model.md#types-that-carry-it) | 54 |
| `ChatEvent` | [06-ui-shell.md#types-that-carry-it](06-ui-shell.md#types-that-carry-it) | 51 |
| `ChatPanel` | [06-ui-shell.md#data-flow](06-ui-shell.md#data-flow) | 32 |
| `ChatTranscriptItem[]` | [05-sessions.md#types-that-carry-it](05-sessions.md#types-that-carry-it) | 50 |
| `claude-gpt` | [00-goals.md#what-an-agent-is-for](00-goals.md#what-an-agent-is-for) | 51 |
| `claude-opus` | [00-goals.md#what-an-agent-is-for](00-goals.md#what-an-agent-is-for) | 51 |
| `claude-sonnet` | [00-goals.md#what-an-agent-is-for](00-goals.md#what-an-agent-is-for) | 51 |
| `cmd.exe` | [04-terminal-panes.md#design-decisions](04-terminal-panes.md#design-decisions) | 59 |
| `com.bs.coding` | [07-build-release.md#types-that-carry-it](07-build-release.md#types-that-carry-it) | 46 |
| `compactIfOverThreshold` | [02-agent-runtime.md#known-limits](02-agent-runtime.md#known-limits) | 116 |
| `Configuration` | [07-build-release.md#types-that-carry-it](07-build-release.md#types-that-carry-it) | 46 |
| `contextBridge` | [01-process-model.md#pieces](01-process-model.md#pieces) | 18 |
| `createLlm` | [02-agent-runtime.md#design-decisions](02-agent-runtime.md#design-decisions) | 82 |
| `createRuntime` | [03-providers.md#types-that-carry-it](03-providers.md#types-that-carry-it) | 60 |
| `credits.balance` | [00-goals.md#group-c-quota-models](00-goals.md#group-c-quota-models) | 158 |
| `credits.has_credits` | [00-goals.md#group-c-quota-models](00-goals.md#group-c-quota-models) | 158 |
| `docs/technical-debt.md` | [00-goals.md#the-four-goals](00-goals.md#the-four-goals) | 29 |
| `electron-builder.ts` | [07-build-release.md#pieces](07-build-release.md#pieces) | 17 |
| `electron-builder` | [07-build-release.md#data-flow](07-build-release.md#data-flow) | 29 |
| `electron.vite.config.ts` | [07-build-release.md#pieces](07-build-release.md#pieces) | 17 |
| `Event*` | [01-process-model.md#data-flow](01-process-model.md#data-flow) | 33 |
| `extraResources` | [07-build-release.md#design-decisions](07-build-release.md#design-decisions) | 58 |
| `fetchUsage` | [03-providers.md#known-limits](03-providers.md#known-limits) | 124 |
| `getItems` | [02-agent-runtime.md#types-that-carry-it](02-agent-runtime.md#types-that-carry-it) | 67 |
| `getWindowChromeOptions` | [06-ui-shell.md#design-decisions](06-ui-shell.md#design-decisions) | 61 |
| `GITHUB_ACTIONS` | [07-build-release.md#design-decisions](07-build-release.md#design-decisions) | 58 |
| `hasRemainingQuota` | [03-providers.md#design-decisions](03-providers.md#design-decisions) | 81 |
| `icon.ico` | [07-build-release.md#pieces](07-build-release.md#pieces) | 17 |
| `ipcRenderer.on` | [01-process-model.md#data-flow](01-process-model.md#data-flow) | 33 |
| `JsonStore` | [05-sessions.md#design-decisions](05-sessions.md#design-decisions) | 66 |
| `listModels` | [03-providers.md#types-that-carry-it](03-providers.md#types-that-carry-it) | 60 |
| `LlmClient` | [02-agent-runtime.md#pieces](02-agent-runtime.md#pieces) | 18 |
| `LoopDeps` | [02-agent-runtime.md#data-flow](02-agent-runtime.md#data-flow) | 38 |
| `MainApp.startUsagePoll` | [03-providers.md#data-flow](03-providers.md#data-flow) | 37 |
| `MainApp` | [01-process-model.md#pieces](01-process-model.md#pieces) | 18 |
| `MAX_COMPACT_PER_RUN` | [02-agent-runtime.md#known-limits](02-agent-runtime.md#known-limits) | 116 |
| `onExit` | [04-terminal-panes.md#design-decisions](04-terminal-panes.md#design-decisions) | 59 |
| `onX` | [01-process-model.md#data-flow](01-process-model.md#data-flow) | 33 |
| `openai.ts` | [03-providers.md#known-limits](03-providers.md#known-limits) | 124 |
| `out/` | [07-build-release.md#pieces](07-build-release.md#pieces) | 17 |
| `PaneModel` | [06-ui-shell.md#pieces](06-ui-shell.md#pieces) | 18 |
| `primaryUsedPercent` | [03-providers.md#design-decisions](03-providers.md#design-decisions) | 81 |
| `proc.onData` | [04-terminal-panes.md#data-flow](04-terminal-panes.md#data-flow) | 29 |
| `productName` | [07-build-release.md#types-that-carry-it](07-build-release.md#types-that-carry-it) | 46 |
| `ProviderAdapter` | [03-providers.md#pieces](03-providers.md#pieces) | 18 |
| `ProviderAuthorizationStrategy` | [03-providers.md#data-flow](03-providers.md#data-flow) | 37 |
| `providerError` | [03-providers.md#design-decisions](03-providers.md#design-decisions) | 81 |
| `ProviderManager.connect` | [03-providers.md#data-flow](03-providers.md#data-flow) | 37 |
| `ProviderManager.refreshUsage` | [03-providers.md#data-flow](03-providers.md#data-flow) | 37 |
| `ProviderQuotaWindow` | [00-goals.md#the-three-quota-models](00-goals.md#the-three-quota-models) | 117 |
| `ProvidersTab.tsx` | [00-goals.md#group-b-the-quota-surface](00-goals.md#group-b-the-quota-surface) | 137 |
| `ProviderUsage.status` | [03-providers.md#design-decisions](03-providers.md#design-decisions) | 81 |
| `ProviderUsage` | [00-goals.md#group-b-the-quota-surface](00-goals.md#group-b-the-quota-surface) | 137 |
| `ProviderUsageLedger` | [00-goals.md#the-three-quota-models](00-goals.md#the-three-quota-models) | 117 |
| `PtyDataEvent` | [01-process-model.md#types-that-carry-it](01-process-model.md#types-that-carry-it) | 54 |
| `PtyManager` | [04-terminal-panes.md#pieces](04-terminal-panes.md#pieces) | 18 |
| `PtySession` | [04-terminal-panes.md#types-that-carry-it](04-terminal-panes.md#types-that-carry-it) | 47 |
| `pushTurn` | [02-agent-runtime.md#known-limits](02-agent-runtime.md#known-limits) | 116 |
| `QuotaAccountUiState` | [06-ui-shell.md#types-that-carry-it](06-ui-shell.md#types-that-carry-it) | 51 |
| `recoverRuntimeContext` | [03-providers.md#types-that-carry-it](03-providers.md#types-that-carry-it) | 60 |
| `refreshAccount` | [03-providers.md#types-that-carry-it](03-providers.md#types-that-carry-it) | 60 |
| `refreshCredentials` | [03-providers.md#types-that-carry-it](03-providers.md#types-that-carry-it) | 60 |
| `refreshProviderAccount` | [00-goals.md#group-b-the-quota-surface](00-goals.md#group-b-the-quota-surface) | 137 |
| `registerIpcHandlers` | [01-process-model.md#data-flow](01-process-model.md#data-flow) | 33 |
| `registerTerminal` | [06-ui-shell.md#data-flow](06-ui-shell.md#data-flow) | 32 |
| `release/` | [07-build-release.md#data-flow](07-build-release.md#data-flow) | 29 |
| `remote-commands.ts` | [08-remote-control.md#data-flow](08-remote-control.md#data-flow) | 30 |
| `RemoteManager` | [08-remote-control.md#pieces](08-remote-control.md#pieces) | 17 |
| `RemotePairing` | [08-remote-control.md#pieces](08-remote-control.md#pieces) | 17 |
| `RemoteStatus` | [08-remote-control.md#data-flow](08-remote-control.md#data-flow) | 30 |
| `resolveShell` | [04-terminal-panes.md#pieces](04-terminal-panes.md#pieces) | 18 |
| `resources/tray-icon.png` | [07-build-release.md#data-flow](07-build-release.md#data-flow) | 29 |
| `scripts/build-windows-icon.mjs` | [07-build-release.md#pieces](07-build-release.md#pieces) | 17 |
| `server/README.md` | [08-remote-control.md#known-limits](08-remote-control.md#known-limits) | 84 |
| `SessionExecutionState` | [05-sessions.md#data-flow](05-sessions.md#data-flow) | 29 |
| `SessionRunner` | [02-agent-runtime.md#pieces](02-agent-runtime.md#pieces) | 18 |
| `sessions.json` | [05-sessions.md#pieces](05-sessions.md#pieces) | 17 |
| `SessionStore` | [05-sessions.md#pieces](05-sessions.md#pieces) | 17 |
| `SharedSessionCoordinator` | [05-sessions.md#pieces](05-sessions.md#pieces) | 17 |
| `sign-windows.ps1` | [07-build-release.md#design-decisions](07-build-release.md#design-decisions) | 58 |
| `SnapshotFile[]` | [05-sessions.md#types-that-carry-it](05-sessions.md#types-that-carry-it) | 50 |
| `SnapshotStore.snapshot` | [05-sessions.md#data-flow](05-sessions.md#data-flow) | 29 |
| `SnapshotTurn` | [05-sessions.md#types-that-carry-it](05-sessions.md#types-that-carry-it) | 50 |
| `SpawnCommand` | [04-terminal-panes.md#types-that-carry-it](04-terminal-panes.md#types-that-carry-it) | 47 |
| `spend_control.individual_limit` | [00-goals.md#group-c-quota-models](00-goals.md#group-c-quota-models) | 158 |
| `src/main/agent/AGENTS.md` | [02-agent-runtime.md#design-decisions](02-agent-runtime.md#design-decisions) | 82 |
| `src/main/agent/llm.ts` | [02-agent-runtime.md#pieces](02-agent-runtime.md#pieces) | 18 |
| `src/main/agent/loop.ts` | [02-agent-runtime.md#pieces](02-agent-runtime.md#pieces) | 18 |
| `src/main/agent/session.ts` | [05-sessions.md#pieces](05-sessions.md#pieces) | 17 |
| `src/main/agent/shared-session-coordinator.ts` | [05-sessions.md#pieces](05-sessions.md#pieces) | 17 |
| `src/main/agent/snapshot.ts` | [05-sessions.md#pieces](05-sessions.md#pieces) | 17 |
| `src/main/bs-agent-manager.ts` | [02-agent-runtime.md#pieces](02-agent-runtime.md#pieces) | 18 |
| `src/main/connections/usage.ts` | [00-goals.md#group-b-the-quota-surface](00-goals.md#group-b-the-quota-surface) | 137 |
| `src/main/index.ts` | [01-process-model.md#pieces](01-process-model.md#pieces) | 18 |
| `src/main/providers/adapters/antigravity.ts` | [03-providers.md#pieces](03-providers.md#pieces) | 18 |
| `src/main/providers/adapters/github-copilot.ts` | [03-providers.md#pieces](03-providers.md#pieces) | 18 |
| `src/main/providers/adapters/openai.ts` | [03-providers.md#pieces](03-providers.md#pieces) | 18 |
| `src/main/providers/registry.ts` | [03-providers.md#pieces](03-providers.md#pieces) | 18 |
| `src/main/providers/types.ts` | [03-providers.md#pieces](03-providers.md#pieces) | 18 |
| `src/main/pty-manager.ts` | [04-terminal-panes.md#pieces](04-terminal-panes.md#pieces) | 18 |
| `src/main/remote/remote-commands.ts` | [08-remote-control.md#pieces](08-remote-control.md#pieces) | 17 |
| `src/main/remote/remote-manager.ts` | [08-remote-control.md#pieces](08-remote-control.md#pieces) | 17 |
| `src/main/remote/remote-pairing.ts` | [08-remote-control.md#pieces](08-remote-control.md#pieces) | 17 |
| `src/main/remote/remote-relay-client.ts` | [08-remote-control.md#pieces](08-remote-control.md#pieces) | 17 |
| `src/main/terminal-shell.ts` | [04-terminal-panes.md#pieces](04-terminal-panes.md#pieces) | 18 |
| `src/preload/index.ts` | [01-process-model.md#pieces](01-process-model.md#pieces) | 18 |
| `src/renderer/AGENTS.md` | [06-ui-shell.md#design-decisions](06-ui-shell.md#design-decisions) | 61 |
| `src/renderer/src/App.tsx` | [06-ui-shell.md#pieces](06-ui-shell.md#pieces) | 18 |
| `src/renderer/src/components/chat/` | [06-ui-shell.md#pieces](06-ui-shell.md#pieces) | 18 |
| `src/renderer/src/components/Pane.tsx` | [04-terminal-panes.md#pieces](04-terminal-panes.md#pieces) | 18 |
| `src/renderer/src/components/quota/quota-view.ts` | [06-ui-shell.md#types-that-carry-it](06-ui-shell.md#types-that-carry-it) | 51 |
| `src/renderer/src/components/RightPanel.tsx` | [06-ui-shell.md#pieces](06-ui-shell.md#pieces) | 18 |
| `src/renderer/src/components/Sidebar.tsx` | [06-ui-shell.md#pieces](06-ui-shell.md#pieces) | 18 |
| `src/renderer/src/components/TitleBar.tsx` | [06-ui-shell.md#pieces](06-ui-shell.md#pieces) | 18 |
| `src/renderer/src/components/XtermHost.tsx` | [04-terminal-panes.md#pieces](04-terminal-panes.md#pieces) | 18 |
| `src/shared/AGENTS.md` | [01-process-model.md#design-decisions](01-process-model.md#design-decisions) | 70 |
| `src/shared/ipc.ts` | [01-process-model.md#types-that-carry-it](01-process-model.md#types-that-carry-it) | 54 |
| `src/shared/remote-types.ts` | [08-remote-control.md#types-that-carry-it](08-remote-control.md#types-that-carry-it) | 49 |
| `src/shared/types.ts` | [06-ui-shell.md#types-that-carry-it](06-ui-shell.md#types-that-carry-it) | 51 |
| `src/shared` | [01-process-model.md#design-decisions](01-process-model.md#design-decisions) | 70 |
| `StoredSession` | [05-sessions.md#types-that-carry-it](05-sessions.md#types-that-carry-it) | 50 |
| `takeSteers` | [02-agent-runtime.md#design-decisions](02-agent-runtime.md#design-decisions) | 82 |
| `TerminalExitEvent` | [04-terminal-panes.md#types-that-carry-it](04-terminal-panes.md#types-that-carry-it) | 47 |
| `tests/` | [01-process-model.md#known-limits](01-process-model.md#known-limits) | 99 |
| `tests/unit/agent-loop.test.ts` | [02-agent-runtime.md#types-that-carry-it](02-agent-runtime.md#types-that-carry-it) | 67 |
| `tests/unit/design-docs.test.ts` | [01-process-model.md#known-limits](01-process-model.md#known-limits) | 99 |
| `tests/unit/ipc-contract.test.ts` | [01-process-model.md#design-decisions](01-process-model.md#design-decisions) | 70 |
| `tests/unit/window-chrome.test.ts` | [06-ui-shell.md#design-decisions](06-ui-shell.md#design-decisions) | 61 |
| `text-delta` | [02-agent-runtime.md#data-flow](02-agent-runtime.md#data-flow) | 38 |
| `titleBarOverlay` | [06-ui-shell.md#design-decisions](06-ui-shell.md#design-decisions) | 61 |
| `toLlmMessages(getItems())` | [02-agent-runtime.md#data-flow](02-agent-runtime.md#data-flow) | 38 |
| `tools/` | [02-agent-runtime.md#design-decisions](02-agent-runtime.md#design-decisions) | 82 |
| `tree-kill` | [04-terminal-panes.md#types-that-carry-it](04-terminal-panes.md#types-that-carry-it) | 47 |
| `TruncationStore` | [05-sessions.md#design-decisions](05-sessions.md#design-decisions) | 66 |
| `tsconfig.test.json` | [01-process-model.md#known-limits](01-process-model.md#known-limits) | 99 |
| `turnId` | [02-agent-runtime.md#known-limits](02-agent-runtime.md#known-limits) | 116 |
| `undoCall` | [05-sessions.md#design-decisions](05-sessions.md#design-decisions) | 66 |
| `undoTurn` | [02-agent-runtime.md#known-limits](02-agent-runtime.md#known-limits) | 116 |
| `window.api` | [01-process-model.md#pieces](01-process-model.md#pieces) | 18 |
| `XtermHost` | [04-terminal-panes.md#data-flow](04-terminal-panes.md#data-flow) | 29 |
<!-- /names -->

## What is here and what is history

`docs/design/` describes the system as it is now. `docs/superpowers/` is a
process archive — 160-odd specs and plans, each a record of one change at one
moment. A plan from 2026-08-04 is accurate about its own moment and says nothing
reliable about today. Read it for how the project got here, not for what it does.

`docs/evidence/` holds manual verification records, and the changelog files
beside them carry the release history.

## Current work

None. v1.1.7 closed four technical debt entries: `tests/` is typechecked, the
quota reason field is named `statusReason`, the chat feed rows are testable,
and narration already stored in a session is flagged when it is reopened.

v1.1.6 closed the narrated tool call defect: shared-session history no
longer attributes tool records to the assistant role, and a model that writes
one out instead of calling the tool raises a visible notice.
`docs/superpowers/specs/2026-08-25-narrated-tool-calls-design.md` has the
measurements that showed it was three providers, not a Gemini incompatibility.

## Next work

Three groups, recorded in [Goals](00-goals.md) with the reasoning behind each.
Group B is in progress.

1. **Group B — the quota surface.** A refresh control on the quota card, banked
   usage shown at all, and a banked reset action for ChatGPT accounts. Small,
   independent of the other two, and the friction met daily.
2. **Group A — routing.** Record quota exhaustion against the pool rather than
   the account, then agent fallback, then the coordinator surface. A1 is a
   prerequisite for A2 and A3.
3. **Group C — quota models.** The balance model for top-up providers, and
   labelled estimates for providers that report nothing.

## Debt

Deferred work is recorded in `docs/technical-debt.md`, one entry per item with
the reason it was set aside and what closing it involves. It is not summarised
here — two copies of a list diverge, which is the same failure this codebase has
already paid for once in duplicated quota state.
