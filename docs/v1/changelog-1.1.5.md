# Changelog — BS Coding v1.1.4 → v1.1.5

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🚀 Improvements
- Settings gains a Usage tab: what each model and each session has cost in tokens and estimated spend, dearest first.
- New sessions are titled by the model after their first turn instead of by the first line of the prompt. Titles you set yourself are never replaced.
- A turn whose request the provider rejects for length now compacts and retries once instead of ending in an error.
- Undo can now target a single tool call rather than only a whole turn.

## 🧹 Internal & Docs
- Classifies a context-length rejection as its own provider error kind, separate from other bad requests.
- Records file snapshots against the tool call that made them; snapshots written before this keep working unchanged.
- Adds a design reference under `docs/design/`, with generated tables of contents and a cross-file name index, plus `docs/technical-debt.md` for deferred work.
- Re-measures the opencode feature gap list against the current code and closes it.
