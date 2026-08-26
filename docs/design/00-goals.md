# Goals

What BS Coding is for, and the two ways it is meant to execute work. Everything
else in this directory describes how the current code behaves; this document
describes what it is trying to become, and is the thing to check a proposal
against.

Recorded 2026-08-26 from the owner's own statement. Before this it existed only
as a spoken list, which caused at least three design proposals to be derived
from a wrong reading of it.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [The four goals](#the-four-goals) | 29-50 | `docs/technical-debt.md` |
| [What an agent is for](#what-an-agent-is-for) | 51-76 | `claude-opus`, `claude-sonnet`, `claude-gpt` |
| [The two execution modes](#the-two-execution-modes) | 77-78 |  |
| &nbsp;&nbsp;[Mode 1 — Single agent with fallback](#mode-1-single-agent-with-fallback) | 79-91 |  |
| &nbsp;&nbsp;[Mode 2 — Multi agent with a coordinator](#mode-2-multi-agent-with-a-coordinator) | 92-102 |  |
| [Vocabulary](#vocabulary) | 103-116 |  |
| [The three quota models](#the-three-quota-models) | 117-131 | `ProviderQuotaWindow`, `ProviderUsageLedger` |
| [The three groups of work](#the-three-groups-of-work) | 132-136 |  |
| &nbsp;&nbsp;[Group B — The quota surface](#group-b-the-quota-surface) | 137-148 | `refreshProviderAccount`, `ProvidersTab.tsx`, `bankedUsed`, `bankedLimit`, `src/main/connections/usage.ts`, `ProviderUsage` |
| &nbsp;&nbsp;[Group A — Routing](#group-a-routing) | 149-157 | `docs/technical-debt.md` |
| &nbsp;&nbsp;[Group C — Quota models](#group-c-quota-models) | 158-163 |  |
| [What this document is not](#what-this-document-is-not) | 164-169 | `0N-*.md` |
<!-- /toc -->

## The four goals

**1. Many accounts, many providers, one work session.** Drive coding work using
several accounts across several providers without leaving the session. This
works today but not well enough — it is the reason the product exists, not a
feature of it.

**2. opencode is the origin, not a standard.** BS Coding was built on opencode.
That is a fact about where the code came from, **not a criterion to design
against**. When a problem appears, solve it; checking whether opencode already
solved it is a tactic for going faster, not an obligation and not a
justification.

**3. Investigate and improve, continuously.** The current version has real gaps.
Finding and closing them is standing work, not a task with an end.
`docs/technical-debt.md` is where what is found and deliberately deferred is
recorded.

**4. Task assignment across agents, with a coordinator.** A main agent takes a
command and directs a coding project by assigning work to other agents. This is
a **new surface, deliberately separate from the current chat frame**.

## What an agent is for

An agent is a **model selector**, not an account selector.

Its purpose is to pair a level of work difficulty with a model: a reasoning
model for analysis, a cheaper one for execution. This optimises quota, and it
exploits providers that offer many models drawing on **separate quota pools** —
Antigravity is the clearest case, but the habit is general. A user will switch
model to save quota on ChatGPT and elsewhere too.

Two consequences follow, and both are load-bearing:

- Two agents may share one account with different models. This is the intended
  pattern, not an edge case.
- Two agents with different models may still draw on the **same quota pool**.
  On the owner's own account, `claude-opus` and `claude-sonnet` are different
  models in the same `claude-gpt` group.

Therefore an agent **points at a pool; it does not own one**. Quota amounts are
held once, per pool, and read by every agent that draws on it. Storing a
per-agent copy would let two agents each believe a shared pool is full. This
project has already paid for duplicated quota state once.

Declaring two agents with the same account *and* the same model is not allowed;
they would be the same thing twice.

## The two execution modes

### Mode 1 — Single agent with fallback

One conversation, one agent at a time. The session is configured with the agent
doing the work and an **ordered list of fallback agents**. When the running
agent's quota is exhausted, the next agent in that list takes over and the turn
continues.

Fallback is **by agent**, not by account or model alone, because an agent
carries its own instructions. Switching agents mid-turn therefore changes the
model, and the history must be handed over in a form the new model can read.

The order is the user's, always. The system does not pick an agent on its own.

### Mode 2 — Multi agent with a coordinator

**Each agent holds its own independent conversation.** BS Coding is the
exchange between them: it carries task packets out and results back.

The coordinator analyses, plans, assigns tasks and reviews results. It does not
do the work itself. That restriction is enforced by the tools it is given, not
by asking it nicely in a prompt — an agent without write tools cannot write.

This is goal 4, and it is a new surface separate from the chat frame.

## Vocabulary

Two different things have been called "session", and the collision has already
caused confusion in design discussion. They are distinguished as:

| Term | Meaning | Owned by |
|---|---|---|
| **Work session** | One piece of work on one project | The user |
| **Agent conversation** | One agent's history with its model | The agent |

Goal 1 means one **work session** may use many accounts. Mode 2 means one work
session contains many **agent conversations**. Both are true, and they do not
conflict.

## The three quota models

A provider reports its limits in one of three shapes. Only the first is fully
supported today.

| Model | Example | Character | Support |
|---|---|---|---|
| **Window** | Antigravity, ChatGPT | Refills on a schedule; has a reset time | Complete |
| **Balance** | DeepSeek | Credit that depletes; topped up by hand; never resets | **None** |
| **Silent** | GitHub Copilot, openai-compatible | Provider reports nothing | Local estimate only |

`ProviderQuotaWindow` is built entirely around a reset time, so a balance cannot
be expressed in it. A silent provider can only be tracked from
`ProviderUsageLedger`, and anything shown for one must be labelled an estimate.

## The three groups of work

Recorded 2026-08-26. Group B is being done first: it is small, independent of
the other two, and addresses friction the owner meets daily.

### Group B — The quota surface

- A refresh control on the quota card. Today `refreshProviderAccount` is reached
  from exactly one place, `ProvidersTab.tsx`, so seeing a current number means
  opening Settings.
- Show banked usage. `bankedUsed` and `bankedLimit` are already parsed from the
  OpenAI response in `src/main/connections/usage.ts` and stored on
  `ProviderUsage`; nothing in the renderer reads them.
- A banked reset action for ChatGPT accounts, so it can be done in the app
  rather than on the web. **Needs API investigation before it can be scoped** —
  no endpoint, IPC channel or control exists for it today.

### Group A — Routing

- **A1. Record quota exhaustion against the pool**, not the account. Today a 429
  from one quota family is stored account-wide, so a healthy pool on the same
  account looks dead. This is `docs/technical-debt.md` item 1, unblocked: it was
  deferred until routing needed it, and mode 1 now needs it.
- **A2. Agent fallback** — mode 1.
- **A3. Coordinator and task exchange** — mode 4's surface.

### Group C — Quota models

- **C1. The balance model**, for top-up providers. Should be designed against a
  real account's response rather than a guess at its shape.
- **C2. Estimates for silent providers**, from the ledger, labelled as estimates.

## What this document is not

It does not describe current behaviour. Each `0N-*.md` beside it does that, and
where the two disagree, this document states the intent and the other states the
fact. A gap between them is work, not an error in either.
