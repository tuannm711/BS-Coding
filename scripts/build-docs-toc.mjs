import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TOC_OPEN = '<!-- toc -->'
export const TOC_CLOSE = '<!-- /toc -->'

const CITED_PREFIXES = ['src/', 'tests/', 'scripts/', 'docs/', 'resources/']
const NAMES_PER_SECTION = 6

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

// A backticked span is worth indexing when it reads like something you would
// grep for. Anything containing whitespace is prose or a shell command.
function isName(span) {
  if (/\s/.test(span)) return false
  if (!/[A-Za-z]/.test(span)) return false
  return /[A-Z]/.test(span) || /[./_-]/.test(span) || /\(\)$/.test(span)
}

function namesIn(body) {
  const found = []
  for (const match of body.matchAll(/`([^`\n]+)`/g)) {
    const span = match[1].trim()
    if (!isName(span) || found.includes(span)) continue
    found.push(span)
  }
  return found.slice(0, NAMES_PER_SECTION)
}

// Sections span from their heading to the line before the next heading, so a
// reader can pull exactly one section out of the file by line range.
export function sectionsOf(markdown) {
  const lines = markdown.split('\n')
  const found = []
  let inFence = false
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const match = /^(#{2,3}) +(.+?)\s*$/.exec(line)
    if (match) found.push({ depth: match[1].length, text: match[2], line: index + 1 })
  })
  return found.map((section, index) => ({
    ...section,
    endLine: index + 1 < found.length ? found[index + 1].line - 1 : lines.length,
    names: namesIn(lines.slice(section.line, index + 1 < found.length ? found[index + 1].line - 1 : lines.length).join('\n'))
  }))
}

function renderRows(sections, shift) {
  const rows = sections.map(section => {
    const indent = section.depth === 3 ? '&nbsp;&nbsp;' : ''
    const names = section.names.map(name => `\`${name}\``).join(', ')
    return `| ${indent}[${section.text}](#${anchorFor(section.text)}) | ${section.line + shift}-${section.endLine + shift} | ${names} |`
  })
  return ['| Section | Lines | Names |', '| --- | --- | --- |', ...rows].join('\n')
}

export function renderToc(markdown) {
  return renderRows(sectionsOf(markdown), 0)
}

// Sections are located in the document with its toc collapsed, then shifted by
// the rows about to be inserted above them, so a line range cited in the toc
// reads back as that section in the finished file. The shift is the two table
// header rows plus one row per section, and it does not depend on the numbers
// being written, so a single pass reaches the fixed point.
export function applyToc(markdown) {
  const open = markdown.indexOf(TOC_OPEN)
  const close = markdown.indexOf(TOC_CLOSE)
  if (open === -1 || close === -1 || close < open) return markdown
  const head = markdown.slice(0, open + TOC_OPEN.length)
  const tail = markdown.slice(close)
  const placeholder = `${head}\n${TOC_CLOSE}${markdown.slice(close + TOC_CLOSE.length)}`
  const sections = sectionsOf(placeholder)
  return `${head}\n${renderRows(sections, sections.length + 2)}\n${tail}`
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

// One hop from a name to the document and line that explains it.
export function buildNameIndex(dir) {
  const index = new Map()
  if (!existsSync(dir)) return index
  for (const name of readdirSync(dir).filter(file => file.endsWith('.md') && file !== 'README.md').sort()) {
    const raw = readFileSync(path.join(dir, name), 'utf8')
    for (const section of sectionsOf(raw)) {
      for (const symbol of section.names) {
        if (index.has(symbol)) continue
        index.set(symbol, { file: name, line: section.line, section: section.text })
      }
    }
  }
  return index
}

export const NAMES_OPEN = '<!-- names -->'
export const NAMES_CLOSE = '<!-- /names -->'

// One hop from a name to the section that introduces it. The first document to
// mention a name owns it, so the index points at an explanation rather than a
// passing reference.
export function renderNameIndex(dir) {
  const rows = []
  for (const [symbol, where] of buildNameIndex(dir)) {
    rows.push(`| \`${symbol}\` | [${where.file}#${anchorFor(where.section)}](${where.file}#${anchorFor(where.section)}) | ${where.line} |`)
  }
  rows.sort((a, b) => a.localeCompare(b))
  return ['| Name | Where | Line |', '| --- | --- | --- |', ...rows].join('\n')
}

export function applyNameIndex(markdown, dir) {
  const open = markdown.indexOf(NAMES_OPEN)
  const close = markdown.indexOf(NAMES_CLOSE)
  if (open === -1 || close === -1 || close < open) return markdown
  const head = markdown.slice(0, open + NAMES_OPEN.length)
  return `${head}\n${renderNameIndex(dir)}\n${markdown.slice(close)}`
}

export function applyTocToDir(dir) {
  if (!existsSync(dir)) return []
  const rewritten = []
  // Two passes, and the order matters. The name index cites lines in the domain
  // documents, so their tocs must be settled before it is built. And inserting
  // the index shifts every line below it, so the host document's own toc has to
  // be rendered after the index, not before.
  const files = readdirSync(dir).filter(file => file.endsWith('.md'))
  for (const name of files) {
    const file = path.join(dir, name)
    const raw = readFileSync(file, 'utf8')
    const next = applyToc(raw)
    if (next !== raw) {
      writeFileSync(file, next)
      rewritten.push(name)
    }
  }
  for (const name of files) {
    const file = path.join(dir, name)
    const raw = readFileSync(file, 'utf8')
    const next = applyToc(applyNameIndex(raw, dir))
    if (next !== raw) {
      writeFileSync(file, next)
      if (!rewritten.includes(name)) rewritten.push(name)
    }
  }
  return rewritten
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFile === fileURLToPath(import.meta.url)) {
  const rewritten = applyTocToDir(path.resolve('docs/design'))
  console.log(rewritten.length === 0 ? 'docs/design: every toc already current' : `docs/design: rewrote ${rewritten.join(', ')}`)
}
