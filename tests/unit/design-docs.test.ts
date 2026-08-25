import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyToc, collectCitedPaths, renderToc } from '../../scripts/build-docs-toc.mjs'

const designDir = path.resolve('docs/design')
const designFiles = existsSync(designDir) ? readdirSync(designDir).filter(name => name.endsWith('.md')) : []

describe('design doc toc generator', () => {
  it('lists every heading with its anchor and line number', () => {
    const doc = ['# Title', '', '<!-- toc -->', '<!-- /toc -->', '', '## First section', '', 'body', '', '### Nested bit'].join('\n')
    expect(renderToc(doc)).toBe([
      '| Section | Line |',
      '| --- | --- |',
      '| [First section](#first-section) | 6 |',
      '| &nbsp;&nbsp;[Nested bit](#nested-bit) | 10 |'
    ].join('\n'))
  })

  it('ignores headings inside fenced code blocks', () => {
    const doc = ['# Title', '', '<!-- toc -->', '<!-- /toc -->', '', '```bash', '## not a heading', '```', '', '## real heading'].join('\n')
    expect(renderToc(doc)).toContain('[real heading](#real-heading)')
    expect(renderToc(doc)).not.toContain('not a heading')
  })

  it('rewrites the toc block in place and is idempotent', () => {
    const doc = ['# Title', '', '<!-- toc -->', 'stale garbage', '<!-- /toc -->', '', '## Only section'].join('\n')
    const once = applyToc(doc)
    expect(once).toContain('[Only section](#only-section)')
    expect(once).not.toContain('stale garbage')
    expect(applyToc(once)).toBe(once)
  })

  it('numbers each line as it will read after the toc is inserted', () => {
    const doc = ['# Title', '', '<!-- toc -->', '<!-- /toc -->', '', '## Alpha', '', 'body', '', '## Beta'].join('\n')
    const applied = applyToc(doc)
    const lines = applied.split('\n')
    const cited = [...applied.matchAll(/\| \[([^\]]+)\]\([^)]+\) \| (\d+) \|/g)]
    expect(cited).toHaveLength(2)
    for (const [, section, line] of cited) {
      expect(lines[Number(line) - 1]).toBe('## ' + section)
    }
  })

  it('leaves a document without toc markers untouched', () => {
    const doc = '# Title\n\n## Section\n'
    expect(applyToc(doc)).toBe(doc)
  })

  it('collects repo paths cited in a document', () => {
    const doc = 'See `src/main/index.ts` and [the card](src/renderer/src/components/quota/QuotaAccountCard.tsx) and `npm test`.'
    expect(collectCitedPaths(doc)).toEqual(['src/main/index.ts', 'src/renderer/src/components/quota/QuotaAccountCard.tsx'])
  })

  it('strips a line suffix and deduplicates cited paths', () => {
    const doc = 'See `src/main/index.ts:651` and `src/main/index.ts` again.'
    expect(collectCitedPaths(doc)).toEqual(['src/main/index.ts'])
  })
})

describe.skipIf(designFiles.length === 0)('design docs stay honest', () => {
  it.each(designFiles)('%s has a current toc', name => {
    const raw = readFileSync(path.join(designDir, name), 'utf8')
    expect(applyToc(raw)).toBe(raw)
  })

  it.each(designFiles)('%s cites only paths that exist', name => {
    const raw = readFileSync(path.join(designDir, name), 'utf8')
    const missing = collectCitedPaths(raw).filter(cited => !existsSync(path.resolve(cited)))
    expect(missing).toEqual([])
  })
})
