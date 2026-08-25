import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TOC_OPEN = '<!-- toc -->'
export const TOC_CLOSE = '<!-- /toc -->'

const CITED_PREFIXES = ['src/', 'tests/', 'scripts/', 'docs/', 'resources/']

// GitHub builds anchors by lowercasing, dropping punctuation and joining the
// remaining words with hyphens.
export function anchorFor(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/ +/g, '-')
}

function headings(markdown) {
  const found = []
  let inFence = false
  markdown.split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const match = /^(#{2,3}) +(.+?)\s*$/.exec(line)
    if (match) found.push({ depth: match[1].length, text: match[2], line: index + 1 })
  })
  return found
}

export function renderToc(markdown) {
  const rows = headings(markdown).map(heading => {
    const indent = heading.depth === 3 ? '&nbsp;&nbsp;' : ''
    return `| ${indent}[${heading.text}](#${anchorFor(heading.text)}) | ${heading.line} |`
  })
  return ['| Section | Line |', '| --- | --- |', ...rows].join('\n')
}

// Rewriting must converge: the toc block itself contains no headings, so a
// second pass over the output produces the same rows as the first.
export function applyToc(markdown) {
  const open = markdown.indexOf(TOC_OPEN)
  const close = markdown.indexOf(TOC_CLOSE)
  if (open === -1 || close === -1 || close < open) return markdown
  const head = markdown.slice(0, open + TOC_OPEN.length)
  const tail = markdown.slice(close)
  const placeholder = `${head}\n${TOC_CLOSE}${markdown.slice(close + TOC_CLOSE.length)}`
  return `${head}\n${renderToc(placeholder)}\n${tail}`
}

export function collectCitedPaths(markdown) {
  const found = []
  const add = candidate => {
    const cleaned = candidate.replace(/:\d+(-\d+)?$/, '').trim()
    if (!CITED_PREFIXES.some(prefix => cleaned.startsWith(prefix))) return
    if (!found.includes(cleaned)) found.push(cleaned)
  }
  for (const match of markdown.matchAll(/`([^`\n]+)`/g)) add(match[1])
  for (const match of markdown.matchAll(/\]\(([^)\s]+)\)/g)) add(match[1])
  return found
}

export function applyTocToDir(dir) {
  if (!existsSync(dir)) return []
  const rewritten = []
  for (const name of readdirSync(dir).filter(file => file.endsWith('.md'))) {
    const file = path.join(dir, name)
    const raw = readFileSync(file, 'utf8')
    const next = applyToc(raw)
    if (next !== raw) {
      writeFileSync(file, next)
      rewritten.push(name)
    }
  }
  return rewritten
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFile === fileURLToPath(import.meta.url)) {
  const dir = path.resolve('docs/design')
  const rewritten = applyTocToDir(dir)
  console.log(rewritten.length === 0 ? 'docs/design: every toc already current' : `docs/design: rewrote ${rewritten.join(', ')}`)
}
