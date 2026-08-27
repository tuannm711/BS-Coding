---
doc_id: COMP-REMOTE-001
title: "Updates và Remote Control"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [updates, remote-control, pairing, relay]
depends_on: [COMP-SEC-001, CONTRACT-001]
---

# 2.17 Updates và Remote Control

## Updates

Retain Electron updater capability. Update service belongs to global application infrastructure, not Project. Support stable/beta channel, check/download/apply status and release notes. Database migrations run before V2 feature use and require backup/rollback policy where destructive.

## Remote Control

Remote Control is optional and disabled by default. It provides remote observation/limited control of a local BS Coding instance through a relay/pairing flow consistent with the prototype.

Required properties:

- short-lived pairing code;
- explicit local enablement;
- authenticated encrypted channel;
- device/session revocation;
- command allowlist;
- no relay-side access to project content when end-to-end encryption is enabled;
- local audit event for connection and every privileged remote command.

Remote control MUST call the same application command services as local UI. It MUST NOT directly access Tool Executor, filesystem or provider secrets.
