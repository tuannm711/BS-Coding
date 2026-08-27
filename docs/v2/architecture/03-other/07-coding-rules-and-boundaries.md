---
doc_id: RULE-001
title: "Coding Rules và Module Boundaries"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "other"
keywords: [coding-rules, modules, dependencies, typescript]
depends_on: []
---

# 3.7 Coding Rules và Module Boundaries

## Proposed V2 package/module shape

```text
src/main/v2/
  application/
  domain/
    project/
    work-session/
    workflow/
    task/
    agent/
    review/
  runtime/
    canonical/
    context/
    agent/
    tools/
    providers/
    routing/
  infrastructure/
    persistence/
    artifacts/
    git/
    processes/
    vault/
    mcp/
    lsp/
  ipc/

src/shared/v2/
  contracts/
  schemas/
  dto/

src/renderer/src/v2/
  app/
  screens/
  features/
  components/
  state/
```

Exact paths MAY change, but dependency direction MUST remain.

## Rules

- Domain code imports only domain/shared primitives.
- Infrastructure implements domain/application ports; domain never imports infrastructure.
- Provider-specific code lives under adapter packages and cannot leak SDK types into shared/domain contracts.
- UI never imports main-process implementation modules.
- Zod schemas used at external boundaries; internal domain functions use typed objects and explicit invariants.
- Avoid files that mix orchestration, provider auth, persistence and UI mapping.
- One module should answer one responsibility and be independently unit-testable.
- Every state transition is a named function/command with tests.
- Do not parse log/prose strings to recover business state when a structured field can exist.

## Legacy coexistence

New V2 code should not gradually import legacy `BsAgentManager` as a central dependency. Legacy adapters MAY be wrapped at the edge temporarily. A compatibility adapter must have a deletion/cutover criterion documented in migration notes.
