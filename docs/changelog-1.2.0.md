# Changelog — BS Coding v1.1.9 → v1.2.0

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🚀 New Features

### Agent fallback
- A quota refusal no longer ends the turn. The work continues on the closest available agent: the same model on another account first, then the same provider with another model, then another provider. The order is by similarity, never by which account has most left.
- An agent whose quota pool is already spent is skipped without a request being made to it.
- The handover is reported in the transcript, naming both agents and the pool, because two agents on different models can share one pool.
- The turn keeps its identity: one turn, one snapshot, so Undo still reverts everything both agents did.

### Coordinate mode and the coordination view
- An agent can be put in Coordinate mode, where it assigns work to your other agents and reviews the results. It cannot write, edit or run commands — the tools are removed rather than discouraged.
- Each assigned agent works in its own conversation with its own model and history, and its report comes back to the coordinator.
- A coordination view, separate from the chat, shows the coordinator alongside one row per assignment with its worker, task, state and result. A row opens that worker's session.
- Stopping the coordinator now stops every agent it started.

## 🐛 Bug Fixes
- Quota exhaustion from one model family no longer marks a whole account unavailable. On an account whose Claude quota is spent while Gemini is untouched, the Gemini models stay usable and the card says which family is spent.
- Usage is now attributed to the right quota pool. Antigravity usage had been recorded with no pool at all, because the lookup relied on a field the provider leaves empty.
- The quota card can be refreshed from the chat panel instead of only from Settings.

## 🧹 Internal & Docs
- Records the product goals, the two execution modes and the planned work in `docs/design/00-goals.md`.
- Adds a provider-level answer to which quota pool a model draws on, replacing a lookup that depended on data the provider does not supply.
- Extracts the runtime error classifier into shared code, so the layer that records a provider error and the layer that routes around it read a message the same way.
- Closes four technical debt entries and records three new ones.
