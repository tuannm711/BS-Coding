# Technical Debt Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Close technical debt items 1, 4, 12 and 13 — typecheck the test suite,
rename a misleading field, make the chat feed rows testable, and flag narration
that was already stored.

**Architecture:** One new tsconfig brings `tests/` under the compiler and the
resulting 77 errors are fixed by correcting fixtures, not by casting. Three
smaller changes follow behind that net: a field rename with a read-side
normalisation, an extraction of the chat feed rows into a pure component, and a
move of one detector into `src/shared` so the renderer can use it too.

**Tech Stack:** TypeScript 5 (`strict`), vitest, React 19, Playwright.

## Global Constraints

- **No `as` casts added to silence a fixture error.** A cast disables the check
  this work exists to enable. Where a fixture is wrong, fix the fixture; where
  the *type* is wrong, fix the type and say so.
- Report every case where making a fixture honest changes what its test asserts.
  Do not fold those into a total.
- Do not rewrite stored data. `connections/accounts.json` and `sessions.json` are
  read, never migrated.
- `tsconfig.test.json` is wired into `npm run typecheck` **only in Task 3**, once
  the error count is zero. Until then `npm run typecheck` must stay green so no
  commit lands against a red run.
- `npm test` must be green at every commit.
- Test baseline: 143 files, **1050** tests.
- Do not tag or bump the version.

### Two facts measured during design, not assumed

`npx tsc` over `tests/**/*` plus `src/renderer/src/env.d.ts` reports **77 errors,
all inside `tests/`**. Without `env.d.ts` it reports 284, the extra 207 being
renderer components that lose the ambient `window.api` declaration. Any run that
reports ~284 means `env.d.ts` fell out of `include`.

`unavailableReason` is present in the real `connections/accounts.json`. The
rename in Task 4 needs the read-side normalisation or stored accounts silently
lose their reason.

---

### Task 1: Bring `tests/` under the compiler and fix the fixture-shape errors

**Files:**
- Create: `tsconfig.test.json`
- Modify: `tests/unit/agent-config.test.ts`, `tests/unit/bs-agent-manager.test.ts`,
  `tests/unit/ipc-contract.test.ts`, `tests/unit/agent-snapshot.test.ts`,
  `tests/unit/agent-trace-manager.test.ts`,
  `tests/integration/provider-agent-chat.test.ts`,
  `tests/integration/shared-session-agent-switch.test.ts`,
  `tests/integration/shared-session-lock.test.ts`,
  `tests/integration/shared-session-restart.test.ts`,
  `tests/unit/provider-snapshot.test.ts`

**Interfaces:**
- Produces: `tsconfig.test.json` at the repo root, not yet referenced by any npm
  script.

- [x] **Step 1: Create the config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"],
    "types": ["node", "@playwright/test"],
    "paths": { "@shared/*": ["./src/shared/*"] }
  },
  "include": ["tests/**/*", "src/renderer/src/env.d.ts"]
}
```

`env.d.ts` is what keeps the count at 77 instead of 284. `@playwright/test` is
already a dev dependency and covers `tests/e2e` rather than excluding it.
`allowJs` lets the two `scripts/*.mjs` imports resolve.

- [x] **Step 2: Record the starting count**

```bash
npx tsc --noEmit -p tsconfig.test.json 2>&1 | grep -c "error TS"
```

Expected: **77**. A number near 284 means `env.d.ts` is missing from `include`.
Save the full output; later steps quote from it.

- [x] **Step 3: Fix the `SnapshotEntry` imports**

Seven sites import a type that does not exist. `src/main/agent/snapshot.ts`
exports `SnapshotTurn`. In each of `tests/unit/agent-snapshot.test.ts`,
`tests/unit/agent-trace-manager.test.ts`, `tests/unit/bs-agent-manager.test.ts`,
`tests/integration/provider-agent-chat.test.ts`,
`tests/integration/shared-session-agent-switch.test.ts`,
`tests/integration/shared-session-lock.test.ts` and
`tests/integration/shared-session-restart.test.ts`, change

```ts
import { SnapshotStore, type SnapshotEntry } from '../../src/main/agent/snapshot'
```

to

```ts
import { SnapshotStore, type SnapshotTurn } from '../../src/main/agent/snapshot'
```

and change each use `memoryStore<SnapshotEntry>()` to `memoryStore<SnapshotTurn>()`.
Read `snapshot.ts` first and confirm `SnapshotTurn` is what `SnapshotStore` is
constructed over; do not assume the compiler's "Did you mean" is right.

- [x] **Step 4: Add a complete-settings helper and use it**

Twelve errors are one cause: `BsSettings` fixtures carrying only `providers` and
`defaultProvider` while the type requires eight more fields. `configToSettings`
in `src/main/agent/config.ts` turns `DEFAULT_BS_CONFIG` into a complete
`BsSettings`, so the base comes from production code and cannot drift.

Add to the top of `tests/unit/agent-config.test.ts`:

```ts
import { configToSettings, DEFAULT_BS_CONFIG } from '../../src/main/agent/config'
import type { BsSettings } from '../../src/shared/types'

// Base every fixture on what production would produce, so a new required field
// on BsSettings does not silently make these fixtures wrong again.
const settings = (partial: Partial<BsSettings>): BsSettings =>
  ({ ...configToSettings(DEFAULT_BS_CONFIG), ...partial })
```

Then wrap each offending literal, e.g.

```ts
const input = settings({
  defaultProvider: 'deepseek',
  providers: [
    { id: 'deepseek', apiKey: 'sk-ds', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat'] }
  ]
})
```

Repeat the same helper (copied, not imported across files) in
`tests/unit/bs-agent-manager.test.ts` and `tests/unit/ipc-contract.test.ts` for
their `BsSettings` literals.

**Watch for a behaviour change here.** A fixture that previously had no `agents`
now carries `DEFAULT_BS_CONFIG`'s agents, which can take a different branch in
`settingsToConfig`. If any assertion changes, stop and report that case
specifically rather than adjusting the expectation.

- [x] **Step 5: Fix the `ProviderAccount` fixtures**

Three sites build an account without `providerId`, `createdAt` and `lastUsedAt`,
in `tests/integration/shared-session-agent-switch.test.ts` (two) and
`tests/integration/shared-session-lock.test.ts` (one). Add the missing fields:

```ts
accounts: [{
  id: 'openai-account', providerId: 'openai', label: 'OpenAI Pro',
  authMode: 'oauth', status: 'active', models: ['gpt-code'],
  createdAt: 1, lastUsedAt: 1
}]
```

Use the connection's own `providerId` for each, and constant timestamps so the
fixtures stay deterministic.

- [x] **Step 6: Fix the `chatTransport` fixtures**

`tests/unit/provider-snapshot.test.ts` lines 33 and 42 build a provider summary
missing the required `chatTransport`. Read the field's type in
`src/shared/types.ts` and supply the value the real `antigravity` provider
declares in `src/main/providers/`, not an invented one.

- [x] **Step 7: Re-count**

```bash
npx tsc --noEmit -p tsconfig.test.json 2>&1 | grep -c "error TS"
```

Expected: roughly **50** remaining. The exact number is not the gate; the gate is
that no error fixed in this task reappears.

- [x] **Step 8: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1050**, and `npm run typecheck` still green because the new config is
not wired in yet. Commit as
`test: correct fixtures that had drifted from the types they model`.

The body must name the `SnapshotEntry` finding: two integration suites imported a
type that does not exist and passed for as long as they have existed, because
vitest erases types without checking them.

---

### Task 2: Fix the narrowing, mock-signature and tuple errors

**Files:**
- Modify: `tests/unit/browser/bridge.test.ts`,
  `tests/integration/browser/bridge-flow.test.ts`,
  `tests/integration/remote/relay-flow.test.ts`,
  `tests/unit/bs-agent-manager.test.ts`,
  `tests/unit/agent-tools-websearch.test.ts`,
  `tests/unit/openai-responses.test.ts`, `tests/unit/provider-antigravity.test.ts`

- [x] **Step 1: Narrow before reading union members**

Five errors read `.data` or `.error` off `BrowserCommandResult`, which is
`{ ok: true; data: ... } | { ok: false; error: string }`. Three more read `.ok`,
`.error` and `.token` off `RemoteEnvelope`. Narrow rather than cast:

```ts
const result = await bridge.run(command)
expect(result.ok).toBe(true)
if (!result.ok) throw new Error(result.error)
expect(result.data).toEqual(expected)
```

The `if` is not dead code: it is what tells the compiler which member it has, and
it turns a wrong shape into a readable failure instead of `undefined`.

For `relay-flow.test.ts:101-102`, read `RemoteEnvelope` in
`src/shared/` first and narrow on whatever discriminant it actually carries.

- [x] **Step 2: Give `createLlm` its real signature**

Six `Tuple type '[]' of length '0'` errors in `tests/unit/bs-agent-manager.test.ts`
come from `vi.fn((): LlmClient => ...)` declaring no parameters, so
`createLlm.mock.calls` is a list of empty tuples and `lastCall[0]` cannot be read.
The mock stands in for a function that takes three arguments; declare them:

```ts
const createLlm = vi.fn((_provider: string, _apiKey: string, _baseUrl?: string): LlmClient => {
```

Check the real `createLlm` signature in `src/main/agent/llm.ts` and match it
exactly. This is the drift itself, not a workaround: a mock whose signature does
not match what it replaces cannot catch a caller passing the wrong thing.

Apply the same treatment to the two tuple errors in
`tests/unit/agent-tools-websearch.test.ts:28`.

- [x] **Step 3: Type the `fetch` mocks**

Six errors in `tests/unit/openai-responses.test.ts` and
`tests/unit/provider-antigravity.test.ts` assign a `vi.fn()` to `global.fetch`
and then read `.mock` back off the global, whose type is the real `fetch`. Keep a
typed reference instead of reaching through the global:

```ts
const fetchMock = vi.fn<typeof fetch>()
globalThis.fetch = fetchMock
// ...
expect(fetchMock.mock.calls[0][0]).toContain('/responses')
```

- [x] **Step 4: Re-count and verify**

```bash
npx tsc --noEmit -p tsconfig.test.json 2>&1 | grep -c "error TS"
npm test && npm run typecheck
```

Expected: about **30** errors remaining, **1050** tests, typecheck green.

- [x] **Step 5: Commit**

Commit as `test: narrow unions and type mocks instead of reaching past the types`.

---

### Task 3: Clear the remainder and wire the config in

**Files:**
- Modify: `src/shared/types.ts`, `src/main/bs-agent-manager.ts`,
  `src/renderer/src/components/chat/chat-event-scope.ts`, `package.json`,
  the remaining test files named by the error output
- Test: `tests/unit/design-docs.test.ts` (add the script-chain guard)

- [x] **Step 1: Declare the chat event scope instead of casting it**

`tests/unit/chat-event-scope.test.ts` reports four errors because `ChatEvent` does
not declare `projectPath`, `sessionId` or `turnId` — yet `emit()` in
`src/main/bs-agent-manager.ts` adds all three and casts with
`as unknown as ChatEvent`, and `acceptChatEvent` reads them back through
`ChatEvent & Partial<ActiveChatScope>`.

Here the fixture is right and the type is wrong. In `src/shared/types.ts`:

```ts
/** Added by BsAgentManager.emit when the event belongs to a project session. */
export interface ChatEventScope {
  projectPath?: string
  sessionId?: string
  turnId?: string
}

export type ChatEvent = ChatEventScope & (
  | { type: 'text-delta'; agentId: string; delta: string }
  // ... the existing union, unchanged
)
```

Then drop the `as unknown as ChatEvent` in `emit()` and the
`ChatEvent & Partial<ActiveChatScope>` cast in `chat-event-scope.ts`, and remove
the `as ChatEvent` casts from the test.

Run `npx vitest run tests/unit/ipc-contract.test.ts` afterwards: that suite
guards the event contract and may enumerate the union.

- [x] **Step 2: Fix the remaining one-off errors**

Work from the saved error output. Each of these is a single site:

- `tests/e2e/smoke.spec.ts:268` — `window` is a local `Page`, so `window.innerWidth`
  types as a `Page` property. Inside the `evaluate` callback the runtime value is
  the DOM window; write `globalThis.innerWidth` and `globalThis.innerHeight` there.
- `tests/unit/design-docs.test.ts` — `range` possibly null at line 32, an implicit
  `any` parameter at line 136. Guard the null and annotate the parameter.
- `tests/unit/windows-icon-build.test.ts:16` — annotate the `entry` parameter.
- `tests/unit/agent-loop.test.ts` — three sites: a `LlmStreamPart[]` passed where
  one part is required, a `string` passed where a `QuestionPrompt` is required,
  and a string index into a fixed-key object.
- `tests/unit/agent-message.test.ts` — three sites, including `Cannot find name
  'TranscriptItem'` at line 138; the type is `ChatTranscriptItem`.
- `tests/unit/provider-github-copilot.test.ts` — `githubAccessToken` is not a
  member of the secrets type; read `ProviderSecrets` in
  `src/main/connections/types.ts` and use the field that exists.
- `tests/unit/remote-manager.test.ts`, `tests/unit/remote-commands.test.ts`,
  `tests/unit/officecli-binary-manager.test.ts`,
  `tests/unit/browser/agent-tools-browser.test.ts` — one or two sites each,
  fixed the same way: supply the missing field, or narrow.

For each, read the real type before changing the test. Do not add a cast.

- [x] **Step 3: Reach zero**

```bash
npx tsc --noEmit -p tsconfig.test.json
echo "EXIT=$?"
```

Expected: `EXIT=0` and no output.

- [x] **Step 4: Wire it into the typecheck chain**

In `package.json`, append to the `typecheck` script:

```
&& tsc --noEmit -p tsconfig.test.json
```

so the full chain is node, web, extension, server, then test.

- [x] **Step 5: Guard the wiring**

Add to `tests/unit/design-docs.test.ts`, which already guards repo-level
invariants:

```ts
it('typechecks the test suite as part of npm run typecheck', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  expect(pkg.scripts.typecheck).toContain('tsconfig.test.json')
})
```

Without this the config can silently fall out of the chain and the whole item
quietly reverts.

- [x] **Step 6: Confirm no cast was added**

```bash
git diff master -- tests/ | grep -nE "^\+.* as [A-Z]"
```

Read every hit. A cast is acceptable only where it existed before this work;
a new one means the error was silenced rather than fixed.

- [x] **Step 7: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1051** tests (the script-chain guard is new), typecheck green with
five projects in the chain. Commit as
`build: typecheck the test suite`.

The body must state what discovery found: two suites importing a type that does
not exist, an `innerWidth` read off a shadowed Playwright `Page`, and a `ChatEvent`
whose scoping fields were carried entirely by casts.

---

### Task 4: Rename `unavailableReason` to `statusReason`

**Files:**
- Modify: `src/shared/types.ts:369`, `src/main/connections/manager.ts`,
  `src/main/connections/store.ts:118`,
  `src/main/providers/adapters/antigravity.ts`,
  `src/main/providers/adapters/openai.ts`,
  `src/main/providers/antigravity-models.ts`,
  `src/renderer/src/components/quota/quota-view.ts`
- Test: `tests/unit/provider-account-store.test.ts` (create if absent)

**Interfaces:**
- Produces: `ProviderUsage.statusReason?: string`. `unavailableReason` no longer
  exists in `src/`.

- [x] **Step 1: Write the failing test for the stored old key**

The field is present in real `connections/accounts.json` files. Add a test that a
record written under the old name still reads:

```ts
it('reads a reason stored under the old key', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'bs-accounts-')), 'accounts.json')
  writeFileSync(file, JSON.stringify({
    version: 1,
    connections: [{
      providerId: 'antigravity', activeAccountId: 'a1',
      accounts: [{
        id: 'a1', providerId: 'antigravity', label: 'a@example.com',
        authMode: 'oauth', status: 'active', models: [], createdAt: 1, lastUsedAt: 1,
        usage: { accountId: 'a1', refreshedAt: 1, source: 'unavailable', status: 'unavailable', unavailableReason: 'Quota exhausted' }
      }]
    }]
  }))
  const store = new ProviderAccountStore(file, new Vault(path.join(path.dirname(file), 'vault.json')))
  expect(store.get('a1')?.usage?.statusReason).toBe('Quota exhausted')
})
```

- [x] **Step 2: Run to confirm it fails**

```bash
npx vitest run tests/unit/provider-account-store.test.ts
```

Expected: fails — `statusReason` is undefined, and the property does not exist on
the type.

- [x] **Step 3: Rename the field**

Rename `unavailableReason` to `statusReason` at all 21 sites in `src/`. Do it by
reading each site, not with a blind find-and-replace: `quota-view.ts:155-159`
tests the string's *content*, and those regexes must keep working.

Do not rename anything in `tests/` yet; Task 3 has made the compiler report those
five files, which is the point.

- [x] **Step 4: Normalise on read**

In `src/main/connections/store.ts`, `load()` at line 118 is the single place
stored records enter the process. Add the normalisation there:

```ts
// Written as unavailableReason before v1.1.7. Accepted on read so a stored
// account keeps its reason; only the new key is ever written back.
function withStatusReason(state: StoredProviderAccounts): StoredProviderAccounts {
  for (const connection of state.connections) {
    for (const account of connection.accounts) {
      const usage = account.usage as (ProviderUsage & { unavailableReason?: string }) | undefined
      if (usage && usage.statusReason === undefined && usage.unavailableReason !== undefined) {
        usage.statusReason = usage.unavailableReason
      }
      if (usage) delete (usage as { unavailableReason?: string }).unavailableReason
    }
  }
  return state
}
```

and return `withStatusReason(parsed as StoredProviderAccounts)` from the success
branch. The cast here reads a key that deliberately no longer exists on the type;
it is describing legacy data, not silencing an error.

- [x] **Step 5: Update the five test files**

`npx tsc --noEmit -p tsconfig.test.json` now names them:
`antigravity-error-classification.test.ts`, `antigravity-quota-refresh.test.ts`,
`antigravity-usage.test.ts`, `quota-snapshot.test.tsx`, `quota-view.test.ts`.
Rename the field in each.

- [x] **Step 6: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1052**. Commit as `refactor: name the field statusReason`.

The body must say the field is persisted and that the read path accepts the old
key, since that is the part a reviewer would otherwise have to discover.

---

### Task 5: Extract the chat feed rows

**Files:**
- Create: `src/renderer/src/components/chat/FeedRow.tsx`
- Modify: `src/renderer/src/components/chat/ChatPanel.tsx`
- Test: `tests/unit/feed-row.test.tsx` (create)

**Interfaces:**
- Produces: `export type FeedItem` and
  `export function FeedRow(props: FeedRowProps)` from `FeedRow.tsx`.
  `ChatPanel` imports `FeedItem` from there rather than declaring it.

- [x] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeedRow, type FeedItem } from '../../src/renderer/src/components/chat/FeedRow'

const render = (item: FeedItem) => renderToStaticMarkup(
  React.createElement(FeedRow, {
    item, commands: [], onOpenImage: () => {}, onOpenFile: () => {}, onOpenSubagent: () => {}
  })
)

describe('FeedRow', () => {
  it('renders a notice', () => {
    const markup = render({ kind: 'notice', id: 'n1', text: 'Nothing ran.' })
    expect(markup).toContain('chat-notice')
    expect(markup).toContain('Nothing ran.')
  })

  it('distinguishes a failed compaction from a successful one', () => {
    expect(render({ kind: 'compaction', id: 'c1' })).toContain('Context compacted')
    const failed = render({ kind: 'compaction', id: 'c2', failed: true })
    expect(failed).toContain('Context compaction failed')
    expect(failed).toContain('failed')
  })

  it('renders an error', () => {
    expect(render({ kind: 'error', id: 'e1', text: 'boom' })).toContain('chat-error')
  })

  it('renders a subagent with its tools and state', () => {
    const markup = render({
      kind: 'subagent', taskId: 't1', text: 'working', tools: ['read', 'bash'], state: 'running'
    })
    expect(markup).toContain('sub-agent')
    expect(markup).toContain('read')
    expect(markup).toContain('state-running')
  })
})
```

- [x] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/feed-row.test.tsx
```

Expected: cannot resolve `FeedRow`.

- [x] **Step 3: Create the component**

Move the `FeedItem` union from `ChatPanel.tsx:18` into `FeedRow.tsx` and export
it. Move the body of the `items.map` callback verbatim into:

```tsx
export interface FeedRowProps {
  item: FeedItem
  commands: Command[]
  onOpenImage: (url: string) => void
  onOpenFile: (path: string) => void
  onOpenSubagent: (taskId: string) => void
}

export function FeedRow({ item, commands, onOpenImage, onOpenFile, onOpenSubagent }: FeedRowProps) {
  // the existing branches, unchanged, minus the `key` props
}
```

The `key` stays on the caller's side, so each branch returns its element without
one. Keep the `message` branch's early `return null` for an empty assistant
message — it is why a streaming turn does not flash an empty bubble.

- [x] **Step 4: Use it from ChatPanel**

```tsx
{items.map(item => (
  <FeedRow
    key={item.kind === 'subagent' ? item.taskId : item.id}
    item={item}
    commands={commands}
    onOpenImage={setLightboxUrl}
    onOpenFile={openFile}
    onOpenSubagent={setLiveTaskId}
  />
))}
```

Import `FeedItem` from `./FeedRow` in `ChatPanel.tsx` and delete the local
declaration.

- [x] **Step 5: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1056**. Commit as `refactor: extract the chat feed rows into FeedRow`.

The body should note that the notice row added in v1.1.6 had never executed until
this test.

---

### Task 6: Flag narration already stored in a transcript

**Files:**
- Create: `src/shared/narrated-tool-call.ts`
- Modify: `src/main/agent/neutral-context.ts`, `src/main/bs-agent-manager.ts`,
  `src/renderer/src/components/chat/ChatPanel.tsx`
- Test: `tests/unit/neutral-context.test.ts`,
  `tests/unit/transcript-notices.test.ts` (create)

**Interfaces:**
- Produces: `looksLikeNarratedToolCall(text: string): boolean` from
  `src/shared/narrated-tool-call.ts`, and
  `withNarrationNotices(items: FeedItem[]): FeedItem[]` from
  `src/renderer/src/components/chat/transcript-notices.ts`.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { withNarrationNotices } from '../../src/renderer/src/components/chat/transcript-notices'
import type { FeedItem } from '../../src/renderer/src/components/chat/FeedRow'

const narrated = '[Tool bash · completed]\nInput: {"command":"ls"}\nOutput: a'

describe('withNarrationNotices', () => {
  it('follows a narrated assistant message with a notice', () => {
    const items: FeedItem[] = [{ kind: 'message', id: 'a1', role: 'assistant', text: narrated }]
    const out = withNarrationNotices(items)
    expect(out).toHaveLength(2)
    expect(out[1].kind).toBe('notice')
  })

  it('leaves ordinary messages alone', () => {
    const items: FeedItem[] = [
      { kind: 'message', id: 'u1', role: 'user', text: narrated },
      { kind: 'message', id: 'a2', role: 'assistant', text: 'I will use the bash tool.' }
    ]
    expect(withNarrationNotices(items)).toHaveLength(2)
  })

  it('gives each notice a distinct id', () => {
    const items: FeedItem[] = [
      { kind: 'message', id: 'a1', role: 'assistant', text: narrated },
      { kind: 'message', id: 'a2', role: 'assistant', text: narrated }
    ]
    const ids = withNarrationNotices(items).filter(i => i.kind === 'notice').map(i => i.id)
    expect(new Set(ids).size).toBe(2)
  })
})
```

The user-role case matters: a user can paste a tool transcript, and flagging that
would be a false alarm.

- [x] **Step 2: Run to confirm failure**

Expected: cannot resolve `transcript-notices`.

- [x] **Step 3: Move the detector to shared**

Cut `NARRATED` and `looksLikeNarratedToolCall` from
`src/main/agent/neutral-context.ts` into `src/shared/narrated-tool-call.ts`
unchanged, including the comment explaining both alternatives. Have
`neutral-context.ts` and `bs-agent-manager.ts` import from
`../../shared/narrated-tool-call` and `./shared/narrated-tool-call` respectively.

`src/main` is not importable from `src/renderer`; `src/shared` is imported by
both already, so this adds no new coupling.

Update the import in `tests/unit/neutral-context.test.ts`, or move the
`looksLikeNarratedToolCall` describe block into a new
`tests/unit/narrated-tool-call.test.ts`. Either is fine; keep the assertions
identical.

- [x] **Step 4: Implement the mapper**

Create `src/renderer/src/components/chat/transcript-notices.ts`:

```ts
import { looksLikeNarratedToolCall } from '@shared/narrated-tool-call'
import type { FeedItem } from './FeedRow'

const NOTICE = 'The model wrote out a tool call instead of making one. Nothing ran.'

// Detection at append time cannot see a session that already contains narration,
// because listSessionTranscript returns stored items without re-reading them.
export function withNarrationNotices(items: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = []
  for (const item of items) {
    out.push(item)
    if (item.kind === 'message' && item.role === 'assistant' && looksLikeNarratedToolCall(item.text)) {
      out.push({ kind: 'notice', id: `n-${item.id}`, text: NOTICE })
    }
  }
  return out
}
```

The id derives from the message id, so it is stable across reloads and distinct
per message — `Date.now()` would collide when two are appended in one pass.

- [x] **Step 5: Use it in loadTranscript**

In `ChatPanel.tsx`, wrap the existing `setItems(items.map(...))` call at the
transcript load so the mapped array passes through `withNarrationNotices` before
reaching `setItems`.

- [x] **Step 6: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1059**. Commit as
`feat: flag narration already stored when a session is reopened`.

---

### Task 7: Update the debt record and report

**Files:**
- Modify: `docs/technical-debt.md`

- [x] **Step 1: Close the four entries**

The document's own rule is "Remove it when the work lands, naming the commit."
Remove entries 1, 4, 12 and 13 and their index rows, renumbering the survivors
and updating every anchor link in the index table.

Entry 9 stays: it is closed but kept deliberately as a record of a summary that
was wrong twice.

Update `Last reviewed:` to `2026-08-26 (v1.1.7, after the debt pass)`.

- [x] **Step 2: Record anything discovered**

If Task 1 or 2 turned up a fixture whose correction changed what a test asserts,
add a new entry describing it rather than leaving it in the commit message alone.

- [x] **Step 3: Regenerate the documentation tables of contents**

```bash
npm run docs:toc
```

`docs/design/README.md` cites `docs/technical-debt.md`; the guard in
`tests/unit/design-docs.test.ts` fails if a table of contents drifts.

- [x] **Step 4: Full verification**

```bash
npm test && npm run typecheck
```

Check the exit status of each, chained with `&&`, not a grep of the output.

- [x] **Step 5: Run the app**

Open a project, confirm a quota card still shows its reason for an account that
had one — this is the `statusReason` read path against real stored data. Then
reopen the session that contains the 17 narrated messages and confirm the notice
now appears beneath them.

- [x] **Step 6: Report and stop**

Do not merge, tag, or push. Report all seven tasks, the final error count at each
stage, and every case where a fixture correction changed an assertion. Wait for
the final gate.
