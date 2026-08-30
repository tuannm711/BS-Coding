import { expect, it } from 'vitest'
import { createV2Api, PUBLIC_V2_API_KEYS } from '../../../src/preload/v2-api'

it('exposes no raw secret, process, filesystem or provider-client handles', () => {
  const api = createV2Api({ invoke: async () => undefined, on: () => {},
    removeListener: () => {}, nextRequestId: () => 'request' })
  const serializedKeys = JSON.stringify({ publicKeys: PUBLIC_V2_API_KEYS,
    namespaces: Object.keys(api), nested: Object.values(api).flatMap(value => Object.keys(value)) })
  expect(serializedKeys).not.toMatch(/rawsecret|plaintext|process|fshandle|filesystem|ipcrenderer|providerclient/i)
  expect(api).not.toHaveProperty('vault')
})
