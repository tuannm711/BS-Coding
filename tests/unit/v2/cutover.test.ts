import { expect, it } from 'vitest'
import { readOnlyArchiveStore, resolveWriterConfiguration } from '../../../src/main/v2/application/cutover'

it('never enables both V1 and V2 mutable session writers', () => {
  expect(resolveWriterConfiguration('2.0.0')).toEqual({ v1Writable: false, v2Writable: true })
  expect(resolveWriterConfiguration('1.3.2')).toEqual({ v1Writable: true, v2Writable: false })
  expect(resolveWriterConfiguration('1.3.2', { forceV2: true }))
    .toEqual({ v1Writable: false, v2Writable: true })
})

it('keeps legacy archive readable but rejects every write', () => {
  const source = { load: () => [{ id: 'legacy' }], save: () => {} }
  const archive = readOnlyArchiveStore(source)
  expect(archive.load()).toEqual([{ id: 'legacy' }])
  expect(() => archive.save([])).toThrow(/read-only archive/i)
})
