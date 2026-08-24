# Shared Session and Provider Chat Verification — 2026-08-24

## Scope

- Branch: `codex/bs-coding-rebrand`
- Verified branch head before release metadata: `6e687c0`
- Electron viewport: 1400 × 900
- Secrets policy: no vault values, authorization URLs, account IDs, tokens, request bodies, or provider response bodies were recorded.

## Automated verification

| Gate | Result |
| --- | --- |
| Focused acceptance suite | PASS — 13 files, 47 tests |
| TypeScript strict checks | PASS — main, renderer, extension, server |
| Full Vitest suite | PASS — 138 files, 933 tests |
| Production Electron build | PASS |
| Playwright Electron E2E | PASS — 14/14 tests |
| Live sanitized provider snapshot | PASS — 1/1 audit, no vault access |

## Original regressions

| Reported symptom | Replacement assertion | Result |
| --- | --- | --- |
| OpenAI rejected raw `tool-call` content | Responses input contains only `input_text`, `output_text`, `function_call`, and `function_call_output` shapes | PASS |
| Mislabeled SSE threw `Unexpected token 'e'` | Decoder sniffs `event:`/`data:`, handles split CRLF frames, and continues after malformed events | PASS |
| Antigravity returned `Requested entity was not found` | One bounded context/catalog refresh changes stale project/runtime ID to the exact refreshed runtime ID | PASS |

## Shared session and Agents UI

- PASS — one project session switches Agents without remounting the chat frame.
- PASS — transcript and session totals remain session-owned across Agent changes.
- PASS — Agent selection is locked while running, prompting, or draining queued work.
- PASS — historical turns retain immutable `Agent · model` attribution after configuration changes or deletion.
- PASS — Settings renders one compact semantic Agent row with Name, Provider, Account, Model, Mode, and icon actions.
- PASS — system prompts are absent from table rows and persist through the dedicated Edit modal.
- PASS — the default Settings dialog has no Agent-table horizontal overflow at the verified viewport.

## Connected-provider inventory

The live app snapshot reported these sanitized accounts:

| Provider / transport | Connected inventory | Catalog/assignment state | Live text/tool turn |
| --- | --- | --- | --- |
| OpenAI ChatGPT OAuth / Responses | 3 active accounts | Current Codex code catalogs; ready assignments present | PASS — user verified all three accounts in the running app |
| Antigravity OAuth / Cloud Code | 1 active account | Gemini and Claude/GPT code catalogs; ready assignments in both families | PASS — user verified chat after runtime-model routing fix |
| OpenAI API key / Responses | NOT CONNECTED | Manual verification unavailable | NOT CONNECTED |
| GitHub Copilot OAuth / OpenAI-compatible | NOT CONNECTED | Canonical refresh/model routing covered by integration tests | NOT CONNECTED |
| Cursor, Windsurf, Kiro, Grok, CodeBuddy, Qoder, Trae, Zed, ZCode | NOT CONNECTED | Each registered adapter maps to the tested OpenAI-compatible contract | NOT CONNECTED |

The automated account audit opened the production build using the existing user data and read only the sanitized preload snapshot. Live provider prompts were performed by the user in the app; no token, account identifier, authorization URL, prompt body, or provider response body was recorded.

## Manual result

- PASS — three ChatGPT OAuth accounts completed chat turns.
- PASS — Antigravity completed chat after the friendly runtime model ID fix.
- PASS — the Agent picker no longer duplicates one Agent across two rows after workspace reconciliation.
- User-provided screenshots documented the pre-fix failures; no account identifiers are retained in this evidence file.
