# Changelog — BS Coding v1.1.2 → v1.1.3

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🐛 Bug Fixes
- Security: clears all 15 known dependency advisories, including a critical arbitrary-file-write in the build toolchain and two high-severity Electron issues covering session cache reuse and a sandboxed-iframe popup bypass.

## 🧹 Internal & Docs
- Updates Electron to 41.10.7 and refreshes the AI SDK, undici and nanoid dependencies to current patches.
- Raises the build-time `@electron/rebuild` dependency past the vulnerable `tar` chain.
- Corrects the LLM variant test fixture to answer streaming requests with server-sent events, matching what real providers return.
- Adds the spec and plan for the remediation under `docs/superpowers/`.
