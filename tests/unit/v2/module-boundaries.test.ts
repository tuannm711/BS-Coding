import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as sharedV2 from '../../../src/shared/v2'

const repoRoot = process.cwd()
const mainV2Root = path.join(repoRoot, 'src/main/v2')
const sharedV2Root = path.join(repoRoot, 'src/shared/v2')
const rendererV2Root = path.join(repoRoot, 'src/renderer/src/v2')

function isWithin(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : []
  })
}

function importedModules(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8')
  const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'\"]*?\s+from\s+)?['\"]([^'\"]+)['\"]|import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)/g
  return Array.from(source.matchAll(importPattern), match => match[1] ?? match[2])
}

function resolveImport(filePath: string, moduleName: string): string | null {
  if (moduleName.startsWith('.')) return path.resolve(path.dirname(filePath), moduleName)
  if (moduleName === '@shared/v2' || moduleName.startsWith('@shared/v2/')) {
    return path.join(repoRoot, 'src/shared', moduleName.slice('@shared/'.length))
  }
  return null
}

function findV2BoundaryViolations(): string[] {
  const violations: string[] = []
  const files = [...sourceFiles(mainV2Root), ...sourceFiles(sharedV2Root), ...sourceFiles(rendererV2Root)]

  for (const filePath of files) {
    for (const moduleName of importedModules(filePath)) {
      const target = resolveImport(filePath, moduleName)
      const display = path.relative(repoRoot, filePath).replaceAll('\\', '/')
      const report = (rule: string): void => {
        violations.push(`${display} imports ${moduleName}: ${rule}`)
      }

      if (isWithin(filePath, sharedV2Root)) {
        if (!target || !isWithin(target, sharedV2Root)) report('shared V2 must stay dependency-free')
        continue
      }

      if (isWithin(filePath, rendererV2Root)) {
        if (moduleName === 'electron' || moduleName.startsWith('node:')) report('renderer cannot import Electron or Node')
        if (target && isWithin(target, path.join(repoRoot, 'src/main'))) report('renderer cannot import main-process code')
        continue
      }

      if (moduleName.includes('bs-agent-manager')) report('V2 cannot depend on legacy orchestration')
      if (target && isWithin(target, path.join(repoRoot, 'src/main')) && !isWithin(target, mainV2Root)) {
        report('main V2 cannot import legacy main-process code')
      }

      const domainRoot = path.join(mainV2Root, 'domain')
      if (isWithin(filePath, domainRoot)) {
        if (!target || (!isWithin(target, domainRoot) && !isWithin(target, sharedV2Root))) {
          report('domain may import only domain or shared V2 primitives')
        }
      }

      const applicationRoot = path.join(mainV2Root, 'application')
      if (isWithin(filePath, applicationRoot)) {
        if (!target || (!isWithin(target, applicationRoot) && !isWithin(target, domainRoot) && !isWithin(target, sharedV2Root))) {
          report('application may import only application, domain, or shared V2 modules')
        }
      }
    }
  }

  return violations
}

describe('v2 module roots', () => {
  it('exposes a loadable shared root', () => expect(sharedV2).toBeDefined())

  it('keeps dependencies pointing inward across V2 module boundaries', () => {
    expect(findV2BoundaryViolations()).toEqual([])
  })
})
