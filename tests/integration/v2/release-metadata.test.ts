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
