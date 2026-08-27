# Provider Tool Input Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore parameterized tool execution for ChatGPT/OpenAI Agents and prevent malformed tool calls from crashing native tools across every provider transport.

**Architecture:** The OpenAI Responses adapter serializes `ToolDefinition.schema` directly into the API's `parameters` field instead of reading a nonexistent AI SDK property. A focused validation module applies existing Zod schemas immediately before execution, while raw JSON Schema/MCP tools retain their current behavior.

**Tech Stack:** Electron 41, TypeScript strict, AI SDK 6, Zod 4, Vitest, Playwright Electron E2E.

---

## File map

- Modify `src/main/agent/openai-responses.ts`: serialize Zod/raw schemas into Responses function parameters.
- Create `src/main/agent/tool-input.ts`: validate Zod-backed tool inputs and format deterministic errors.
- Modify `src/main/agent/loop.ts`: validate after permission approval and before calling `ToolDefinition.run`.
- Modify `tests/unit/openai-responses.test.ts`: reproduce and protect OpenAI function schema/argument behavior.
- Modify `tests/unit/agent-loop.test.ts`: protect executor validation, normalization, and raw-schema compatibility.
- Modify `tests/integration/provider-chat-matrix.test.ts`: retain transport coverage after contract changes.
- Create `docs/changelog-1.0.1.md`: document the hotfix release.
- Modify `package.json`, `package-lock.json`, and `src/main/providers/adapters/antigravity.ts`: set release version 1.0.1.

### Task 1: Restore OpenAI Responses tool schemas

**Files:**
- Modify: `tests/unit/openai-responses.test.ts`
- Modify: `src/main/agent/openai-responses.ts:1-145`

- [ ] **Step 1: Write the failing request-contract test**

Add imports and a test that captures the outgoing request with real native tool definitions:

```ts
import { bashTool } from '../../src/main/agent/tools/bash'
import { readTool } from '../../src/main/agent/tools/read'
import { createSkillTool } from '../../src/main/agent/tools/skill'

it('sends required JSON Schema parameters for native tools', async () => {
  let requestBody: any
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body))
    return new Response(JSON.stringify(OPENAI_COMPLETED), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }) as unknown as typeof fetch
  const client = new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl })

  for await (const _part of client.stream({
    model: 'gpt-5.6-sol',
    system: 'Use tools.',
    messages: [{ role: 'user', content: 'inspect the project' }],
    tools: [readTool, bashTool, createSkillTool(() => undefined)]
  })) { /* consume */ }

  const byName = Object.fromEntries(requestBody.tools.map((item: any) => [item.name, item]))
  expect(byName.read.parameters.required).toContain('file_path')
  expect(byName.bash.parameters.required).toContain('command')
  expect(byName.skill.parameters.required).toContain('name')
  expect(JSON.stringify(requestBody.tools)).not.toContain('"$schema"')
})
```

- [ ] **Step 2: Run RED and verify the exact failure**

Run:

```powershell
npx vitest run tests/unit/openai-responses.test.ts -t "sends required JSON Schema parameters"
```

Expected: FAIL because `byName.read.parameters` is undefined.

- [ ] **Step 3: Implement direct Responses schema conversion**

Replace the `toToolDefinition` dependency and current `toTools` implementation:

```ts
import type { ToolDefinition, ToolSchema } from './tools/types'

function toResponsesParameters(schema: ToolSchema): Record<string, unknown> {
  const convertible = schema as { toJSONSchema?: () => unknown }
  const converted = typeof convertible.toJSONSchema === 'function'
    ? convertible.toJSONSchema()
    : schema
  if (!converted || typeof converted !== 'object' || Array.isArray(converted)) {
    return { type: 'object', properties: {} }
  }
  const { $schema: _schema, ...parameters } = converted as Record<string, unknown>
  return parameters
}

function toTools(tools: ToolDefinition[]): unknown[] {
  return tools.map(definition => ({
    type: 'function',
    name: definition.name,
    description: definition.description,
    parameters: toResponsesParameters(definition.schema)
  }))
}
```

- [ ] **Step 4: Run GREEN and the complete OpenAI Responses suite**

Run:

```powershell
npx vitest run tests/unit/openai-responses.test.ts
```

Expected: the file passes, including the new required-parameters assertion.

- [ ] **Step 5: Add a valid streamed function-call regression test**

Add this test to the same file:

```ts
it('preserves valid streamed function-call arguments', async () => {
  const events = [
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: 'call-read',
        name: 'read',
        arguments: JSON.stringify({ file_path: 'package.json' })
      }
    })}\n\n`,
    `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'response-tools' } })}\n\n`
  ]
  const fetchImpl = vi.fn(async () => chunkedResponse(events)) as unknown as typeof fetch
  const client = new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl })
  const parts = []

  for await (const part of client.stream({
    model: 'gpt-5.6-sol', system: 'Use tools.', messages: [], tools: [readTool]
  })) parts.push(part)

  expect(parts).toContainEqual(expect.objectContaining({
    kind: 'tool-call', toolName: 'read', toolInput: { file_path: 'package.json' }
  }))
})
```

- [ ] **Step 6: Run both OpenAI tool tests**

```powershell
npx vitest run tests/unit/openai-responses.test.ts
```

Expected: all OpenAI Responses tests pass.

- [ ] **Step 7: Commit the transport fix**

```powershell
git add -- src/main/agent/openai-responses.ts tests/unit/openai-responses.test.ts
git commit -m "fix: advertise tool parameters to OpenAI Responses"
```

### Task 2: Validate native tool inputs before execution

**Files:**
- Create: `src/main/agent/tool-input.ts`
- Modify: `src/main/agent/loop.ts:245-310`
- Modify: `tests/unit/agent-loop.test.ts`

- [ ] **Step 1: Write the failing required-input test**

Import Zod and add this runner test:

```ts
import { z } from 'zod'

it('rejects invalid Zod tool input before the implementation runs', async () => {
  const runSpy = vi.fn(async () => ({ output: 'must not run' }))
  const read: ToolDefinition = {
    name: 'read',
    description: 'Read a file',
    schema: z.object({ file_path: z.string() }),
    run: runSpy
  }
  const h = makeHarness({ tools: new Map([['read', read]]) })
  h.llm.queue = [
    [{ kind: 'tool-call', toolCallId: 'tc-invalid', toolName: 'read', toolInput: {} }, { kind: 'finish' }],
    textParts('corrected')
  ]

  await h.runner.run()

  expect(runSpy).not.toHaveBeenCalled()
  const result = h.items.find(item => item.kind === 'tool' && item.tool.id === 'tc-invalid')
  expect(result?.kind === 'tool' && result.tool.error).toMatch(/^read: invalid input: file_path:/)
  expect(JSON.stringify(h.llm.calls[1]?.messages)).toContain('read: invalid input')
})
```

- [ ] **Step 2: Run RED and verify the current TypeError/implementation call**

```powershell
npx vitest run tests/unit/agent-loop.test.ts -t "rejects invalid Zod tool input"
```

Expected: FAIL because the tool implementation is called with `{}`.

- [ ] **Step 3: Implement the focused validation module**

Create `src/main/agent/tool-input.ts`:

```ts
import type { ToolDefinition } from './tools/types'

interface ValidationIssue {
  path?: PropertyKey[]
  message?: string
}

interface SafeParseSuccess {
  success: true
  data: unknown
}

interface SafeParseFailure {
  success: false
  error: { issues?: ValidationIssue[] }
}

type ToolInputValidation =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; error: string }

export function validateToolInput(
  definition: ToolDefinition,
  input: Record<string, unknown>
): ToolInputValidation {
  const schema = definition.schema as {
    safeParse?: (value: unknown) => SafeParseSuccess | SafeParseFailure
  }
  if (typeof schema.safeParse !== 'function') return { ok: true, input }

  const parsed = schema.safeParse(input)
  if (parsed.success) return { ok: true, input: parsed.data as Record<string, unknown> }

  const detail = (parsed.error.issues ?? []).map(issue => {
    const location = issue.path?.length ? issue.path.map(String).join('.') : 'input'
    return `${location}: ${issue.message ?? 'invalid value'}`
  }).join('; ') || 'input: invalid value'
  return { ok: false, error: `${definition.name}: invalid input: ${detail}` }
}
```

- [ ] **Step 4: Integrate validation into `SessionRunner.executeCall`**

Import `validateToolInput` and replace the direct run block:

```ts
const validated = validateToolInput(def, call.input)
if (!validated.ok) {
  call.error = validated.error
} else {
  call.input = validated.input
  try {
    const r = await def.run(validated.input, toolCtx)
    call.output = r.output
    call.error = r.error
  } catch (err) {
    call.error = String(err)
  }
}
```

- [ ] **Step 5: Run GREEN for required-input validation**

```powershell
npx vitest run tests/unit/agent-loop.test.ts -t "rejects invalid Zod tool input"
```

Expected: PASS; implementation call count is zero and the clean error reaches the next model step.

- [ ] **Step 6: Add normalization and raw-schema compatibility tests**

Add two tests:

```ts
it('runs a Zod tool with its parsed input', async () => {
  const runSpy = vi.fn(async () => ({ output: 'ok' }))
  const tool: ToolDefinition = {
    name: 'read', description: 'Read',
    schema: z.object({ file_path: z.string(), limit: z.number().default(20) }),
    run: runSpy
  }
  const h = makeHarness({ tools: new Map([['read', tool]]) })
  h.llm.queue = [
    [{ kind: 'tool-call', toolCallId: 'tc-valid', toolName: 'read', toolInput: { file_path: 'a.ts' } }, { kind: 'finish' }],
    textParts('done')
  ]
  await h.runner.run()
  expect(runSpy).toHaveBeenCalledWith({ file_path: 'a.ts', limit: 20 }, expect.anything())
})

it('preserves raw JSON Schema tool execution', async () => {
  const runSpy = vi.fn(async () => ({ output: 'raw ok' }))
  const tool: ToolDefinition = {
    name: 'mcp_raw', description: 'Raw MCP tool',
    schema: { type: 'object', properties: { value: { type: 'string' } } },
    run: runSpy
  }
  const h = makeHarness({ tools: new Map([['mcp_raw', tool]]) })
  h.llm.queue = [
    [{ kind: 'tool-call', toolCallId: 'tc-raw', toolName: 'mcp_raw', toolInput: { value: 'x' } }, { kind: 'finish' }],
    textParts('done')
  ]
  await h.runner.run()
  expect(runSpy).toHaveBeenCalledWith({ value: 'x' }, expect.anything())
})
```

- [ ] **Step 7: Run the complete loop suite**

```powershell
npx vitest run tests/unit/agent-loop.test.ts
```

Expected: all runner tests pass without changing permission behavior.

- [ ] **Step 8: Commit shared validation**

```powershell
git add -- src/main/agent/tool-input.ts src/main/agent/loop.ts tests/unit/agent-loop.test.ts
git commit -m "fix: validate native tool input before execution"
```

### Task 3: Prove provider transport compatibility

**Files:**
- Modify: `tests/integration/provider-chat-matrix.test.ts`

- [ ] **Step 1: Pass tools through the matrix helper**

Update the helper without changing existing callers:

```ts
import type { ToolDefinition } from '../../src/main/agent/tools/types'
import { readTool } from '../../src/main/agent/tools/read'

async function consume(
  client: LlmClient,
  model: string,
  messages: ModelMessage[],
  tools: ToolDefinition[] = []
): Promise<LlmStreamPart[]> {
  const parts: LlmStreamPart[] = []
  for await (const part of client.stream({ model, system: 'You code.', messages, tools })) parts.push(part)
  return parts
}
```

- [ ] **Step 2: Add cross-transport required-schema assertions**

Add a test for the three serializer families:

```ts
it.each([
  ['openai-responses', 'gpt-5.6-sol'],
  ['openai-compatible', 'fixture-code'],
  ['cloud-code', 'gemini-3.1-pro-high']
] as const)('%s advertises required read arguments', async (transport, model) => {
  let body: any
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body))
    if (transport === 'openai-responses') return new Response(JSON.stringify(OPENAI_COMPLETED), {
      status: 200, headers: { 'content-type': 'application/json' }
    })
    if (transport === 'cloud-code') return chunkedResponse([CLOUD_CODE_TEXT_SSE])
    return chunkedResponse([OPENAI_COMPATIBLE_TEXT_SSE])
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = transport === 'openai-responses'
    ? new OpenAIResponsesClient({ apiKey: 'fixture-token', fetchImpl: fetchMock as unknown as typeof fetch })
    : transport === 'cloud-code'
      ? createAntigravityLlm('fixture-token', { projectId: 'fixture', modelId: model })
      : createLlm('openai-compatible', 'fixture-token', 'https://provider.invalid/v1')

  await consume(client, model, [{ role: 'user', content: 'read package.json' }], [readTool])

  const required = transport === 'openai-responses'
    ? body.tools[0].parameters.required
    : transport === 'cloud-code'
      ? body.request.tools[0].functionDeclarations[0].parameters.required
      : body.tools[0].function.parameters.required
  expect(required).toContain('file_path')
})
```

- [ ] **Step 3: Run the provider matrix**

```powershell
npx vitest run tests/integration/provider-chat-matrix.test.ts
```

Expected: OpenAI Responses, AI SDK OpenAI-compatible, GitHub Copilot, and Antigravity coverage passes.

- [ ] **Step 4: Run all tool/transport-focused tests**

```powershell
npx vitest run tests/unit/openai-responses.test.ts tests/unit/agent-loop.test.ts tests/unit/agent-llm.test.ts tests/unit/antigravity-runtime.test.ts tests/integration/provider-chat-matrix.test.ts tests/integration/provider-agent-chat.test.ts
```

Expected: all selected files pass.

- [ ] **Step 5: Commit matrix coverage**

```powershell
git add -- tests/integration/provider-chat-matrix.test.ts
git commit -m "test: enforce tool schemas across provider transports"
```

### Task 4: Complete automated acceptance and live verification

**Files:**
- No production file changes.

- [ ] **Step 1: Run strict TypeScript checks**

```powershell
npm run typecheck
```

Expected: node, renderer, extension, and server checks exit 0.

- [ ] **Step 2: Run the full unit/integration suite**

```powershell
npm test
```

Expected: all test files and tests pass with zero failures.

- [ ] **Step 3: Run production build and Electron E2E**

```powershell
npm run build
npm run e2e
```

Expected: Electron production bundles build and all Playwright tests pass.

- [ ] **Step 4: Check patch hygiene and sensitive data**

```powershell
git diff --check
git status --short
```

Expected: only committed implementation plus the user's existing icon/logo modifications are present; no session, account, token, authorization URL, or provider response file is tracked.

- [ ] **Step 5: Merge into `master` without staging user assets**

Run from `C:\Users\brads\Documents\BS Coding`:

```powershell
git merge --no-ff codex/bs-coding-rebrand -m "merge: restore provider tool execution"
```

Expected: merge succeeds and existing `bs-coding-logo.png` plus `build/icons/*.png` modifications remain untouched.

- [ ] **Step 6: Verify the merged result**

```powershell
npm run typecheck
npm test
npm run build
npm run e2e
```

Expected: all four gates pass on `master`.

- [ ] **Step 7: Start the merged app for user verification**

```powershell
npm run dev
```

Manual acceptance in a new session:

1. Select a ChatGPT OAuth Agent using `gpt-5.6-sol`.
2. Ask it to inspect the current work and continue.
3. Confirm `skill`, `read`, and `bash` cards show non-empty inputs.
4. Confirm the Agent reads a file and executes a harmless command successfully.
5. Switch to an Antigravity or other connected Agent and repeat one harmless tool call.

Expected: new calls contain arguments; no `undefined`, missing-command, or invalid-path error occurs.

### Task 5: Package hotfix release 1.0.1 after live PASS

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main/providers/adapters/antigravity.ts`
- Create: `docs/changelog-1.0.1.md`

- [ ] **Step 1: Set the patch version**

Change the root package and lockfile versions from `1.0.0` to `1.0.1`, and set Antigravity `pluginVersion` to `1.0.1`.

- [ ] **Step 2: Write the hotfix changelog**

Create `docs/changelog-1.0.1.md`:

```md
# Changelog — BS Coding v1.0.0 → v1.0.1

## 🐛 Bug Fixes
- OpenAI: restore required function parameters for ChatGPT OAuth and Responses API Agents.
- Agents: validate native tool inputs before execution and return correctable errors instead of runtime exceptions.
- Providers: enforce required tool schemas across OpenAI Responses, Cloud Code, Copilot, and OpenAI-compatible transports.

## 🧹 Internal & Docs
- Add transport and executor regression coverage for parameterized tool calls.
```

- [ ] **Step 3: Run version-focused verification**

```powershell
npm run typecheck
npx vitest run tests/unit/openai-responses.test.ts tests/unit/agent-loop.test.ts tests/integration/provider-chat-matrix.test.ts
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit release metadata**

```powershell
git add -- package.json package-lock.json src/main/providers/adapters/antigravity.ts docs/changelog-1.0.1.md
git commit -m "chore: release BS Coding 1.0.1"
```

- [ ] **Step 5: Merge release metadata into `master`**

```powershell
git merge --no-ff codex/bs-coding-rebrand -m "merge: release BS Coding 1.0.1"
```

Expected: merge succeeds without staging user-owned icon or logo changes.

- [ ] **Step 6: Build and verify Windows artifacts**

```powershell
npm run typecheck
npm test
npm run dist
Get-FileHash -Algorithm SHA256 release/BS.Coding.Setup.1.0.1.exe,release/BS.Coding.1.0.1.exe
(Get-Item 'release/win-unpacked/BS Coding.exe').VersionInfo | Select-Object ProductName,ProductVersion,FileVersion
```

Expected: typecheck and all tests pass; installer and portable 1.0.1 exist with SHA-256 hashes; executable metadata reports BS Coding 1.0.1.
