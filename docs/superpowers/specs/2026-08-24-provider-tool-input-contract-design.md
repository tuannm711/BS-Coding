# Provider Tool Input Contract Design

Date: 2026-08-24

## Problem

OpenAI Responses requests currently advertise tool names and descriptions but omit each tool's parameter schema. `toToolDefinition()` returns an AI SDK tool with an `inputSchema` property, while the OpenAI adapter reads a nonexistent `parameters` property. ChatGPT therefore emits function calls with empty arguments, which are persisted as `{}` and later cause every parameterized tool to fail.

Evidence from the affected production session shows OpenAI `gpt-5.6-sol` persisted empty inputs for `skill`, `bash`, and `read` before execution. Runtime inspection of the installed AI SDK confirms the generated tool has `description` and `inputSchema`, and no `parameters` property.

## Design

### OpenAI Responses schema serialization

The Responses adapter converts each `ToolDefinition.schema` directly to JSON Schema:

- Zod schemas use their `toJSONSchema()` output.
- Existing JSON Schema objects pass through unchanged.
- The informational `$schema` field is removed from Zod output before transmission.
- The request continues to use the Responses function shape: `type`, `name`, `description`, and `parameters`.

This correction is local to `OpenAIResponsesClient`. Antigravity keeps its Cloud Code schema sanitizer, and Anthropic, Google, and OpenAI-compatible transports continue using the AI SDK `inputSchema` path.

### Shared executor validation

Before a tool executes, the session runner validates arguments against the tool's Zod schema when `safeParse()` is available. Successful parsing supplies the normalized value to the executor. Failed parsing:

- does not call the tool implementation;
- records a deterministic `<tool>: invalid input: <path>: <message>` result;
- returns that result to the model so it can correct the next call;
- never exposes a Node.js `TypeError` or stack trace to the transcript.

Raw JSON schemas, including MCP definitions, remain unchanged because the application does not include a general JSON Schema validator. Their existing execution path is preserved.

### Existing sessions

Historical `{}` calls and their errors remain immutable. The fix affects newly generated calls. A fresh session is recommended for manual acceptance testing so the model does not inherit invalid calls from the old transcript.

## Error handling

- Malformed OpenAI function-call JSON remains normalized to `{}` at the transport boundary, then produces a clear schema-validation result instead of reaching the executor.
- Unknown tools retain the existing `unknown tool` result.
- Permission checks retain their current order and behavior.
- Provider stream and session failures remain isolated from tool validation.

## Tests

1. Capture an OpenAI Responses request with real `read`, `bash`, and `skill` definitions and assert that `parameters.required` contains each required field.
2. Stream a Responses function call with valid arguments and assert the exact object reaches the session runner.
3. Pass `{}` to a required-argument tool and assert its implementation is not called and the transcript contains a clean validation error.
4. Verify raw JSON Schema tools keep their current execution path.
5. Run the existing provider chat matrix for OpenAI Responses, Antigravity, GitHub Copilot, and OpenAI-compatible transports.

## Acceptance criteria

- New OpenAI/ChatGPT OAuth tool calls contain model-generated arguments instead of universal `{}` inputs.
- Valid tool calls continue working across all provider transports.
- Invalid Zod-backed calls cannot crash `read`, `write`, `edit`, `bash`, `skill`, or other native tools.
- Existing session history is not rewritten.
- `npm run typecheck`, `npm test`, `npm run build`, and Electron E2E pass before merge.
