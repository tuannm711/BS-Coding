import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { resolveWriterConfiguration } from '../../../src/main/v2/application/cutover'

it('release metadata selects the V2 production writer', () => {
  const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    version: string
  }
  expect(packageJson.version).toBe('2.0.0')
  expect(resolveWriterConfiguration(packageJson.version)).toEqual({
    v1Writable: false, v2Writable: true
  })
})

it('runs Node ABI tests before rebuilding native modules for Electron', () => {
  const workflow = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'build.yml'), 'utf8')
  const testJob = workflow.slice(workflow.indexOf('  test:'), workflow.indexOf('\n  build:'))

  expect(testJob.indexOf('- run: npm test')).toBeGreaterThan(-1)
  expect(testJob.indexOf('- run: npx @electron/rebuild')).toBeGreaterThan(
    testJob.indexOf('- run: npm test')
  )
})

it('uses a supported Node runtime in CI', () => {
  const workflow = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'build.yml'), 'utf8')
  const configuredVersions = [...workflow.matchAll(/node-version:\s*(\d+)/g)]
    .map(match => Number(match[1]))

  expect(configuredVersions.length).toBeGreaterThan(0)
  expect(configuredVersions.every(version => version >= 22)).toBe(true)
})

it('packages macOS natively and consolidates one multi-arch updater manifest', () => {
  const workflow = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'build.yml'), 'utf8')

  expect(workflow).toMatch(/os: macos-latest\s+target: mac\s+package_args: --mac --arm64/)
  expect(workflow).toMatch(/os: macos-15-intel\s+target: mac\s+package_args: --mac --x64/)
  expect(workflow).toContain('electron-builder ${{ matrix.package_args }}')
  expect(workflow).toContain('mac-update-metadata:')
  expect(workflow).toContain('node scripts/generate-mac-update-metadata.mjs')
  expect(workflow).toContain('needs: [build, mac-update-metadata]')
})

it('leaves macOS target architecture to the invoking package command', () => {
  const builder = readFileSync(path.join(process.cwd(), 'electron-builder.ts'), 'utf8')
  const macConfig = builder.slice(builder.indexOf('  mac: {'), builder.indexOf('\n  }',
    builder.indexOf('  mac: {')))
  const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }

  expect(macConfig).not.toContain('arch:')
  expect(packageJson.scripts['dist:mac']).toContain('--x64 --arm64')
})
