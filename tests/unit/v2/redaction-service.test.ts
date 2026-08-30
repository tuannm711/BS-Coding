import { expect, it } from 'vitest'
import { redactObject } from '../../../src/main/v2/application/security/redaction-service'

it('redacts nested secret keys, bearer values and known secret values without mutation', () => {
  const input = { nested: { accessToken: 'abc' }, safe: 'ok',
    header: 'Bearer bearer-token', text: 'prefix known-secret suffix', list: ['env-secret'] }
  expect(redactObject(input, { knownValues: ['known-secret', 'env-secret'] })).toEqual({
    nested: { accessToken: '[REDACTED]' }, safe: 'ok', header: '[REDACTED]',
    text: 'prefix [REDACTED] suffix', list: ['[REDACTED]']
  })
  expect(input.nested.accessToken).toBe('abc')
})

it('preserves primitive types and safely handles repeated object references', () => {
  const shared = { safe: 1 }
  expect(redactObject({ a: shared, b: shared, enabled: true, empty: null }))
    .toEqual({ a: { safe: 1 }, b: { safe: 1 }, enabled: true, empty: null })
})
