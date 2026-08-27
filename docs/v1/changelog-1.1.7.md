# Changelog — BS Coding v1.1.6 → v1.1.7

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🚀 Improvements
- Reopening a session that already contains a narrated tool call now says so, instead of leaving it to be spotted by eye. Previously only narration written live was flagged.

## 🐛 Bug Fixes
- Quota cards keep the reason a refresh degraded across the rename of that field; accounts saved by earlier versions still read correctly.

## 🧹 Internal & Docs
- The test suite is now typechecked as part of `npm run typecheck`, with a guard that fails if it is ever dropped from the chain. Turning it on found two suites importing a type that does not exist, an API contract stub 24 members behind the interface it checks, a Playwright assertion reading a shadowed global, and a mis-scoped cast that made a test argument meaningless.
- Corrects three production signatures that were narrower than the calls they actually receive, rather than papering over them in the fixtures.
- Declares the session scope carried on every chat event, removing the two casts that used to smuggle it across the process boundary.
- Extracts the chat transcript rows into `FeedRow`, so each row kind is covered by a rendering test and `ChatPanel` drops about 140 lines.
- Renames `unavailableReason` to `statusReason`, which is what the field means.
- Closes four entries in `docs/technical-debt.md` and repoints every citation to them, correcting two design statements that had gone stale.
