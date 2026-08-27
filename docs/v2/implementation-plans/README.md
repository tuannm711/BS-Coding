# BS Coding V2.0.0 Implementation Plans

This pack is the implementation companion to the approved **BS Coding V2.0.0 Architecture Pack** and Figma Make prototype.

## Start here

1. Read [`00-MASTER-PLAN.md`](00-MASTER-PLAN.md).
2. Keep the architecture pack beside this folder as `architecture/` when giving both to AI Coder.
3. Execute detailed files in `plans/` according to the dependency graph; do not treat the file number alone as permission to skip failed dependencies.

## Source baseline

- Repository: `tuannm711/BS-Coding`
- Baseline: `master@8160ce8d2b61da2253e906843978ee5014c97467`
- Baseline version: `1.3.1`
- Approved Figma Make: https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

## Structure

```text
00-MASTER-PLAN.md
plans/
  01-foundation-module-boundaries.md
  ...
  20-verification-release-cutover.md
PLAN-MANIFEST.md
```

## Important

These plans intentionally build new V2 modules beside V1 and delay the production writer/UI cutover until final verification. Existing V1 provider adapters, tool registry, MCP/LSP, vault and updater are reusable only behind V2 ports/adapters; they are migration inputs, not target architecture boundaries.
