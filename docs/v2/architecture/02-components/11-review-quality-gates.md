---
doc_id: COMP-QUALITY-001
title: "Review, Rework và Quality Gates"
version: "2.0.0-target"
status: "LOCKED FOR V2 DESIGN"
section: "components"
keywords: [review, quality-gate, security, qa, rework, verification]
depends_on: [COMP-WF-001, COMP-TEAM-001]
---

# 2.11 Review, Rework và Quality Gates

## Layers

### Mechanical gates
Examples: typecheck, build, lint, unit/integration tests, dependency/security scanners. Results are deterministic and include command, exit code, duration, artifact/log references.

### Specialist AI reviews
Code Reviewer, Security Reviewer and QA/Tester operate on explicit scope and evidence. A review produces `PASS | PASS_WITH_SUGGESTIONS | FAIL | BLOCKED` plus Findings.

### Final Verification
Final verifier confirms required mechanical gates and mandatory reviews passed for the final integrated changeset. It does not trust worker self-report.

## Finding model

Fields: severity (`INFO|LOW|MEDIUM|HIGH|CRITICAL`), category, description, evidence refs, affected files, reviewer AgentVersion, status (`OPEN|ACCEPTED|FIXED|DISMISSED`), linked rework Task.

## Rework loop

The prototype lifecycle is normative:

```text
Review FAIL
 → create rework Task (e.g. T09)
 → worker fixes
 → mechanical checks rerun
 → failed specialist review rerun
 → PASS
 → Final Verification
 → COMPLETED
```

Only impacted gates MAY be selectively rerun when the gate dependency graph proves others unaffected; otherwise rerun all required final gates.

## Completion invariant

`[COMP-QUALITY-R01]` WorkSession/WorkflowRun cannot become COMPLETED until all blocking gates are PASS and no blocking Finding remains open. No AgentRun success event can bypass this rule.
