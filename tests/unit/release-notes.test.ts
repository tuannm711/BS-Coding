import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Kept when the V1 design-doc tooling was retired with V1. This guard is not
// about documentation conventions — it protects the release: the publish job
// reads docs/release-notes/<tag>.md by name, so a version bumped without notes
// fails ten minutes into a build instead of here.
describe('release notes', () => {
  it('exist for the current version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    expect(existsSync(path.join('docs', 'release-notes', `v${pkg.version}.md`))).toBe(true)
  })
})
