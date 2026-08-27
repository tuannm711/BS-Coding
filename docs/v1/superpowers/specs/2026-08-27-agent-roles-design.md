# Agent roles: one coordinator, chosen workers, spare quota — design

Date: 2026-08-27
Branch: `feat/fleet-surface` (continues)
Scope decided by the owner: roles are **per project**, not per session.

## 1. Two coordinators can be lit at once, and I caused it

`setMode` demotes any other coordinating agent in the same `cwd`. That works —
in the manager's memory, and nowhere else:

```ts
setAgentMode(agentId: string, mode: AgentMode): void {
  this.bsAgent.setMode(agentId, mode)                       // demotes the other one
  const updated = this.workspaces.updateAgent(ws.projectPath, agentId, { mode })
  this.pushAgentConfig(updated, agentId)                    // saves and pushes only this one
}
```

The demoted agent is never written to `workspaces.json` and never pushed to the
renderer. So the panel keeps showing it as coordinating, and a restart restores
two coordinators from the file.

**Fix:** the demotion is part of the same operation as the promotion. `setMode`
returns which agents it changed, and every one of them is persisted and pushed.

## 2. The role controls are two buttons pretending to be a switch

Today: pressing coordinator turns the worker toggle off; pressing worker does
not release coordination; and an agent already coordinating cannot be released
from its own row.

**Three states, one switch.** An agent is exactly one of:

| State | Means |
|---|---|
| **Coordinator** | directs this project; not assignable |
| **Worker** | can be given work by the coordinator |
| **No role** | neither — spare capacity, see §4 |

Pressing the control that is already on returns the agent to **no role**.
Pressing the other moves it there directly. Nothing is disabled, and nothing
disappears, because a control that vanishes is how the last version became a
one-way door.

`worker` stays a boolean on `AgentConfig`; the third state is
`mode !== 'coordinate' && worker === false`. No new field: a role enum beside
`mode` would be the second answer to one question that the owner rejected once
already.

## 3. Account type becomes a badge

`Antigravity · OAuth · g1-pro-tier` is one line of grey text. The plan and the
state beside it are badges. Same kind of fact, so the same treatment — the auth
mode and plan become tight badges on the source line.

## 4. An agent with no role is the coordinator's fallback

This closes a hole I opened. `handoff` filters candidates to the same mode, and
a coordinator is now exclusive — so **a coordinator has no fallback at all**.
Its quota runs out and the turn simply fails.

### What a handoff actually swaps, which is not what I claimed

```ts
// loop.ts:151
const stream = (target?.llm ?? this.deps.llm).stream({
  model: target?.model ?? this.deps.model,
  system: (target?.system ?? this.deps.system) + (this.deps.systemSuffix?.() ?? ''),
  tools: isLastStep ? [] : this.visibleToolDefs(),
```

`tools` comes from the **original** runner, always. The comment I wrote on the
mode filter — *"a candidate in another mode has a different tool set"* — is
false. A handoff borrows the other agent's account, model and base system
prompt; the tool set and the system suffix stay with the agent whose turn it is.

So the real objection to a cross-mode handoff is the borrowed **system prompt**,
not the tools.

### Decided: a handoff borrows the endpoint, not the prompt

`llm` and `model` come from the target; `system` stays the original agent's,
alongside the `systemSuffix` that already did. A handoff means exactly one
thing — **another account answers this turn** — and the turn keeps its own
identity, instructions and mode note throughout.

Two consequences follow, and both are the point rather than side effects:

- **The mode filter goes.** It was added on a false premise, and with the prompt
  no longer borrowed there is nothing left for it to protect. A rule removed,
  not a rule added.
- **Any agent with no role can serve any turn.** Which is what "spare quota"
  already meant; the code simply did not agree yet.

The serving account's own instructions and mode note stop applying to a turn it
did not start. That is correct — they describe an agent that is not doing this
work — but it is a change in what a handoff has meant until now, and it applies
to **every** handoff, not only a coordinator's.

## Verification

1. Promoting a second coordinator writes **both** agents to `workspaces.json`
   and pushes **both** configs; the panel shows exactly one lit, and a restart
   agrees.
2. Pressing the lit coordinator control returns that agent to no role.
3. Pressing worker on a coordinating agent moves it to worker and releases the
   coordination.
4. No role control is ever disabled or hidden.
5. A role-less agent does not appear in the coordinator's roster.
6. A coordinator refused for quota continues on a role-less agent's account.
7. The system prompt sent after a handoff is the original agent's, not the
   serving agent's — asserted on a build agent's handoff too, since the change
   is not specific to coordinators.
8. A build agent still falls back to a plan-mode agent's account without the
   mode filter, and carries its own tools and prompt while doing so.
9. Auth mode and plan render as badges.
10. `npm test`, `npm run typecheck`, `npm run build`.

## Risks

**Persisting two agents in one call.** `updateAgent` is per agent, so the
promotion path writes twice. If the second write fails the file holds two
coordinators again — the same state this fixes. Worth ordering demotion first,
so a failure leaves none rather than two.

**This changes every handoff, not only a coordinator's.** A build agent falling
back to another account also keeps its own prompt now. More correct by the same
argument, and wider than the problem reported — worth watching for a turn that
relied on the serving agent's instructions without anyone noticing.

**Three states in two buttons.** Nothing shows "no role" positively; it is both
controls unlit. Acceptable at this width, but it is an absence carrying meaning.

## Out of scope

Drag-to-reorder for sessions. Raised earlier and not decided; not assumed here.

## Success criteria

Exactly one agent in a project is lit as coordinator, in the panel and in the
file. Every role control can be pressed to undo what it did. A coordinator that
runs out of quota continues on an agent nobody assigned a role to.
