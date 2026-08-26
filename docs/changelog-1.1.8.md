# Changelog — BS Coding v1.1.7 → v1.1.8

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🧹 Internal & Docs
- The release workflow now publishes a short changelog with each release, read from `docs/release-notes/<tag>.md`. Every release since v1.1.1 published with an empty body because the publish job had no checkout and so could not read any file in the repository.
- Adds a test that fails when a version is bumped without its release notes, so the omission surfaces before a build rather than after one.
- Backfills the notes for v1.1.1 through v1.1.7 and commits them, so the repository and GitHub agree.

There is no change to the application in this release.
