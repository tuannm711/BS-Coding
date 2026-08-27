# Changelog — BS Coding v1.1.5 → v1.1.6

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🐛 Bug Fixes
- Shared sessions: a model no longer learns to write out a tool call as text instead of making one. Prior turns are still flattened for the next provider, but tool records are no longer attributed to the assistant, which is what taught the imitation.
- Shared sessions: a turn that writes out a tool call instead of making one now raises a notice in the transcript, so a turn that looks productive but ran nothing is visible rather than silent.

## 🧹 Internal & Docs
- Compiled shared-session history keeps roles alternating, which Gemini requires and the record message would otherwise break.
- Adds a system prompt line, on the shared-session path only, stating that history records are logs and tools are used through the tool interface.
- Records the measurements behind the fix: three providers narrated tool calls in the affected session, so this was never a Gemini incompatibility.
- Adds two debt entries for what the fix does not cover: the notice has no rendering test, and narration already stored is not flagged on reopening a session.
