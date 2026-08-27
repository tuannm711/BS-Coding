# Remote control

Driving a BS Coding session from a phone. The desktop half and the relay are
built and wired into `MainApp`; the mobile client is not, which is why every
changelog still says "Coming Soon". This document describes what exists.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 17-29 | `src/main/remote/remote-manager.ts`, `RemoteManager`, `src/main/remote/remote-relay-client.ts`, `src/main/remote/remote-pairing.ts`, `RemotePairing`, `src/main/remote/remote-commands.ts` |
| [Data flow](#data-flow) | 30-48 | `remote-commands.ts`, `RemoteManager`, `RemoteStatus`, `Channels.EventRemoteStatus` |
| [Types that carry it](#types-that-carry-it) | 49-58 | `RemoteStatus`, `src/shared/remote-types.ts`, `remote-commands.ts` |
| [Design decisions](#design-decisions) | 59-83 |  |
| [Known limits](#known-limits) | 84-94 | `server/README.md` |
<!-- /toc -->

## Pieces

| Path | Responsibility |
|---|---|
| `src/main/remote/remote-manager.ts` | `RemoteManager`: owns the relay connection and reports status |
| `src/main/remote/remote-relay-client.ts` | The outbound WebSocket client, with reconnection |
| `src/main/remote/remote-pairing.ts` | `RemotePairing`: issues and redeems the six-digit code |
| `src/main/remote/remote-commands.ts` | The safety gate — the only commands a phone may run |
| `src/main/remote/remote-settings.ts` | `RemoteSettingsStore`: persisted to `remote.json` |
| `src/shared/remote-types.ts` | `RemoteStatus` and the command payloads |
| `src/renderer/src/components/settings/RemoteTab.tsx` | Enable, show the pairing code, revoke |
| `server/index.ts` | The relay itself, run separately |

## Data flow

**Both sides dial out.** Desktop and phone each open an outbound WebSocket to a
self-hosted relay, so neither needs an inbound port or NAT configuration. The
relay routes opaque messages between one paired desktop and one phone and stores
nothing.

**Pairing.** The desktop shows a six-digit code with roughly a five-minute TTL.
The phone redeems it for a long-lived session token it keeps for later
connections. The desktop can revoke that token at any time from the Remote tab.

**Commands.** A message from the phone reaches `remote-commands.ts`, which
switches on the command name. Anything not in that switch is refused. The relay
never interprets a payload; the gate is entirely on the desktop.

**Status.** `RemoteManager` emits `RemoteStatus` over `Channels.EventRemoteStatus`
so the Remote tab can show whether the relay is connected and whether a phone is
paired.

## Types that carry it

`RemoteStatus` in `src/shared/remote-types.ts` is what the renderer sees:
connection state and pairing state.

The command set is a closed union handled in `remote-commands.ts`. Ten commands
exist: `workspace:list`, `agent:list`, `agent:state`, `session:list`,
`session:create`, `session:switch`, `session:rename`, `session:messages`,
`chat:respond` and `chat:send`.

## Design decisions

**The relay stores nothing and understands nothing.** It routes opaque frames
between a pair. That is what lets it be self-hosted without becoming a place
where sessions or credentials accumulate.

**Remote control is off until explicitly enabled.** Not a default, not a setting
that drifts on. The desktop must be turned on, then paired, then it accepts
anything at all.

**The exposed surface is read-only plus two writes.** Seven of the ten commands
read. `session:create`, `session:switch` and `session:rename` change session
bookkeeping, and `chat:send` and `chat:respond` speak to an agent. No command
runs a tool, spawns a process, edits a file, or touches provider credentials —
that stays on the desktop where the user can see it.

**The gate is a switch statement, not a filter.** Adding a capability means
adding a case, which is a visible edit in a small file, rather than relaxing a
predicate somewhere. A command that does not appear cannot be reached.

**Pairing codes expire; tokens are revocable.** The short-lived code limits the
window in which an observer could use it, and the long-lived token exists so the
phone does not re-pair constantly. Revocation is on the desktop because that is
the side the user trusts.

## Known limits

There is no mobile client. Everything above is reachable only by something that
speaks the protocol.

The relay needs a TLS reverse proxy in front of it before being exposed; it
listens on plain `0.0.0.0:3928` by default. `server/README.md` carries a Caddy
example.

One desktop pairs with one phone. There is no multi-device pairing.
