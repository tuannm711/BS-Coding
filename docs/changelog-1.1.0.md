# Changelog — BS Coding v1.0.0 → v1.1.0

## 🚀 New Features

### Codex-style chat scrolling
- Anchors each newly submitted turn near the top of the chat feed and follows growing responses without per-token animation.
- Yields viewport control to manual wheel, touch, keyboard, or scrollbar navigation and resumes only near the bottom or through Scroll to end.

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🐛 Bug Fixes
- OpenAI: restores required function parameters for ChatGPT OAuth and Responses API Agents.
- Agents: validates native tool inputs before execution and returns correctable errors instead of runtime exceptions.
- Providers: enforces required tool schemas across OpenAI Responses, Cloud Code, Copilot, and OpenAI-compatible transports.
- Chat: restores long transcripts at their true end and prevents streaming updates from overriding manual scroll position.

## 🧹 Internal & Docs
- Adds state and Electron regression coverage for turn anchoring, automatic following, manual takeover, and scroll restoration.
- Adds transport and executor regression coverage for parameterized provider tool calls.
