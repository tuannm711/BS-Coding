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

it('packages both macOS architectures with matching native PTY binaries', () => {
  const workflow = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'build.yml'), 'utf8')

  expect(workflow).toMatch(/os: macos-latest\s+target: mac\s+package_args: --mac/)
  expect(workflow).not.toContain('macos-15-intel')
  expect(workflow).toContain('@lydell/node-pty-darwin-x64@$PTY_X64_VERSION')
  expect(workflow).toContain('for app_dir in mac-arm64 mac')
  expect(workflow).toContain('electron-builder ${{ matrix.package_args }}')
})
