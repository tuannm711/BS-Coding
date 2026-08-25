import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyToc, collectCitedPaths, renderNameIndex, renderToc } from '../../scripts/build-docs-toc.mjs'

const designDir = path.resolve('docs/design')
const designFiles = existsSync(designDir) ? readdirSync(designDir).filter(name => name.endsWith('.md')) : []

describe('design doc toc generator', () => {
  it('lists every heading with its anchor and range, nesting the deeper ones', () => {
    const doc = ['# Title', '', '<!-- toc -->', '<!-- /toc -->', '', '## First section', '', 'body', '', '### Nested bit'].join('\n')
    expect(renderToc(doc)).toBe([
      '| Section | Lines | Names |',
      '| --- | --- | --- |',
      '| [First section](#first-section) | 6-9 |  |',
      '| &nbsp;&nbsp;[Nested bit](#nested-bit) | 10-10 |  |'
    ].join('\n'))
  })

  it('gives each section a line range and the symbols it names', () => {
    const doc = ['# Title', '', '<!-- toc -->', '<!-- /toc -->', '', '## Alpha', '', 'uses `MainApp` and `Channels` here', '', '## Beta', '', 'body'].join('\n')
    const toc = applyToc(doc)
    expect(toc).toContain('| Section | Lines | Names |')
    expect(toc).toMatch(/\[Alpha\]\(#alpha\) \| 10-13 \| `MainApp`, `Channels` \|/)
  })

  it('ends the last range at the last line of the document', () => {
    const doc = ['# Title', '', '<!-- toc -->', '<!-- /toc -->', '', '## Only', '', 'last line'].join('\n')
    const applied = applyToc(doc)
    const lines = applied.split('\n')
    const range = /\| \d+-(\d+) \|/.exec(applied)
    expect(Number(range[1])).toBe(lines.length)
  })

  it('drops backticked prose and commands from the names column', () => {
    const doc = ['# Title', '', '<!-- toc -->', '<!-- /toc -->', '', '## Alpha', '', 'run `npm test` then call `applyToc`'].join('\n')
    const tocBlock = applyToc(doc).split('<!-- toc -->')[1].split('<!-- /toc -->')[0]
    expect(tocBlock).toContain('`applyToc`')
    expect(tocBlock).not.toContain('npm test')
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
    const cited = [...applied.matchAll(/\| \[([^\]]+)\]\([^)]+\) \| (\d+)-(\d+) \|/g)]
    expect(cited).toHaveLength(2)
    for (const [, section, start, end] of cited) {
      expect(lines[Number(start) - 1]).toBe('## ' + section)
      expect(Number(end)).toBeGreaterThanOrEqual(Number(start))
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

describe('the name index', () => {
  it('renders each name once, pointing at the document and line that introduces it', () => {
    const rendered = renderNameIndex(designDir)
    expect(rendered).toContain('| Name | Where |')
    const names = [...rendered.matchAll(/^\| `([^`]+)`/gm)].map(match => match[1])
    expect(new Set(names).size).toBe(names.length)
  })

  it('cites a line that really holds that section heading', () => {
    for (const [, file, line] of renderNameIndex(designDir).matchAll(/\]\((\d{2}-[a-z-]+\.md)#[^)]*\) \| (\d+)/g)) {
      const lines = readFileSync(path.join(designDir, file), 'utf8').split('\n')
      expect(lines[Number(line) - 1]).toMatch(/^#{2,3} /)
    }
  })
})

describe('the design overview indexes the detail files', () => {
  const overview = readFileSync(path.join(designDir, 'README.md'), 'utf8')

  it('links to every domain document', () => {
    const linked = [...overview.matchAll(/\]\((\d{2}-[a-z-]+\.md)\)/g)].map(match => match[1])
    expect([...new Set(linked)].sort()).toEqual(designFiles.filter(name => /^\d{2}-/.test(name)).sort())
  })

  it('carries current work, next work and a pointer to debt', () => {
    expect(overview).toContain('## Current work')
    expect(overview).toContain('## Next work')
    expect(overview).toContain('docs/technical-debt.md')
  })

  it('does not restate the debt items', () => {
    expect(overview).not.toContain('Test files are typechecked by nothing')
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
