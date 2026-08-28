---
doc_id: PROTO-000
title: "Approved Figma Make Prototype — Vendored Export"
version: "2.0.0-target"
status: "REFERENCE — UX BEHAVIOR CONTRACT"
section: "prototype"
keywords: [figma, prototype, ux-contract, vendored, p15]
depends_on: [INDEX-000, RULE-001]
---

# Approved Figma Make Prototype (vendored export)

Source of truth for **target V2 user-visible behavior and layout**, per the authority
table in [`../architecture/README.md`](../architecture/README.md).

- **Origin:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1
- **Export archive:** `Design Markdown Specifications.zip`
- **Exported:** 2026-08-27
- **Vendored on branch:** `v2/p01-foundation`
- **Contents:** `figma-make/` — 46 files, React 19 + Vite + Tailwind v4 sandbox app

## What this is and is not

| | |
|---|---|
| **Is** | The UX behavior contract. Screen inventory, navigation, states, copy, layout intent. |
| **Is not** | Production source code. Do not copy files into `src/renderer/src/v2` wholesale. |

`architecture/README.md` rule 4 applies: *treat the prototype as the UX behavior contract,
not as production source code.* If a prototype interaction cannot be implemented without
breaking a stated architecture or security invariant, **stop and raise the mismatch** —
do not weaken the invariant, and do not silently redesign the interaction.

## When it gets used

Primarily [`../implementation-plans/plans/15-renderer-ui-figma-binding.md`](../implementation-plans/plans/15-renderer-ui-figma-binding.md)
(Renderer V2 UI and Figma Prototype Binding), which depends on P14 typed IPC plus stable
backend projections. Earlier plans may read it for terminology and state naming only.

## Entry points

| Path | Purpose |
|---|---|
| `figma-make/src/imports/pasted_text/bs-coding-ux-ui-redesign.md` | The written UX/UI redesign specification |
| `figma-make/src/App.tsx` | Root component; screen routing and shell |
| `figma-make/src/screens/` | Top-level screens: Home, Project, WorkSession, Agents, Settings, States |
| `figma-make/src/screens/work/` | Work Session tabs: Conversation, Plan, Tasks, Execution, Changes, Review, runtime |
| `figma-make/src/screens/project/` | Project tabs: WorkSessions, Files, Git, Mcp, Skills, ProjectAgents, ProjectSettings |
| `figma-make/src/screens/settings/` | Settings panels and provider/account configuration |
| `figma-make/src/screens/StatesScreen.tsx` | Prototype's state catalogue — cross-check against `STATE-001` |

## Deviations from the raw archive

The export is stored verbatim except for four files renamed so that this vendored sandbox
cannot hijack tooling in **this** repository. Contents are unchanged.

| Archive path | Stored as | Why |
|---|---|---|
| `CLAUDE.md` | `CLAUDE.figma-make.md` | Would be auto-loaded as project instructions by agentic tools working under `docs/v2/` |
| `AGENTS.md` | `AGENTS.figma-make.md` | Same; describes the Figma sandbox (Vite 8, Tailwind v4, dev server on `:8443`), which contradicts this repo |
| `.gitattributes` | `gitattributes.figma-make.txt` | 100 `filter=lfs` rules; this repo does not use Git LFS |
| `.gitignore` | `gitignore.figma-make.txt` | Sandbox ignore rules, not this repo's |

`figma-make/package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json` and
`.figma/` are kept for fidelity. **They are inert here** — this directory is outside every
`include` glob in `tsconfig.*.json` and outside the `tests/**` glob in `vitest.config.ts`,
so it is never typechecked, tested, or bundled. Do not run `pnpm install` inside it.
