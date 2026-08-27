---
doc_id: COMP-SEC-001
title: "Security, Permissions và Secrets"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [security, permissions, safeStorage, secrets, sandbox]
depends_on: [ARCH-OVR-001]
---

# 2.15 Security, Permissions và Secrets

## Security boundaries

- Renderer is untrusted relative to privileged main-process operations.
- Secrets never cross into renderer in plaintext.
- All IPC commands are validated and authorized.
- Tool execution requires structured call + permission decision.
- Workspace path checks prevent accidental access outside permitted roots unless explicitly approved.

## Secret storage

Use Electron `safeStorage` vault or equivalent OS-protected encryption. DB stores account metadata and vault key/reference, not raw token/API key. Logs/events MUST redact secrets before persistence.

## Permission categories

At minimum: file read, file write/edit, shell, Git read, Git write/push, browser, web/network, MCP tools, office tools, destructive file operations, external process/native agent control.

Global defaults are overridden by Project and Agent policies; hard security denies cannot be overridden by lower-level policy.

## Shell/process safety

Command policy should classify known destructive patterns, but MUST NOT rely solely on regex. Permission is based on tool category + arguments + workspace. Process cancellation uses process-tree termination where needed and records result.

## Prompt-injection boundary

Content from repository, web, MCP, terminal or tool output is data, not trusted instruction. Tool Protocol Guard prevents text content from becoming executable call. Agent system instructions MUST make trust boundaries explicit, but enforcement is code-based.

## Remote control

If enabled, it MUST use pairing, authenticated encrypted channel, revocation and minimal exposed command surface. See `COMP-REMOTE-001`.
