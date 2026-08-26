# Changelog — BS Coding v1.1.8 → v1.1.9

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🚀 Improvements
- The chat panel's quota card gains a Refresh button. Until now the only way to see a current number was to open Settings, and the automatic poll runs every five minutes.
- ChatGPT accounts show how many rate-limit reset credits they hold.
- A reset credit can now be spent from the card instead of on the web. The control is offered only when the account's weekly quota is below 5% remaining, since a reset restores the whole weekly quota and spending one earlier wastes most of its value. A confirmation states that the action cannot be undone.

## 🐛 Bug Fixes
- Refreshing an account no longer empties the quota card until the session is switched. The refresh channel returned a snapshot without agent assignments, which the chat panel reads; the settings page never noticed because it does not render them.
- Quota reset information now reads the field the provider actually returns. The previous field had never appeared in any response, so nothing that depended on it worked.

## 🧹 Internal & Docs
- Records the product goals, the two execution modes and the three groups of planned work in `docs/design/00-goals.md`, and separates the two meanings that had both been called "session".
- Adds a guard that fails the test suite when a version is bumped without release notes.
