import { describe, expect, it } from 'vitest'
import { SessionCdpEvents } from '../../../src/browser-extension/cdp-events'

describe('owned-tab CDP events', () => {
  it('observes only attached owned tabs and excludes headers and response bodies', () => {
    const logs = new SessionCdpEvents()
    expect(logs.record('a', 10, 20, 'Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'unattached' }] })).toBeNull()
    expect(logs.record(undefined, 10, 10, 'Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'unowned' }] })).toBeNull()
    logs.record('a', 10, 10, 'Network.requestWillBeSent', { requestId: 'request', timestamp: 1, request: { method: 'GET', url: 'https://example.test/path', headers: { authorization: 'secret' }, postData: 'private' } })
    const event = logs.record('a', 10, 10, 'Network.responseReceived', { requestId: 'request', timestamp: 1.2, response: { status: 200, headers: { cookie: 'secret' }, body: 'private' } })
    expect(event).toMatchObject({ name: 'network', data: { method: 'GET', url: 'https://example.test/path', status: 200, ms: 200 } })
    expect(JSON.stringify(logs.network('a'))).not.toMatch(/secret|private|headers|body/)
    expect(logs.network('b')).toEqual([])
  })

  it('bounds each owner log at 200 entries without mixing owners', () => {
    const logs = new SessionCdpEvents()
    for (let i = 0; i < 205; i++) logs.record('a', 10, 10, 'Runtime.consoleAPICalled', { type: 'log', args: [{ value: `entry-${i}` }] })
    logs.record('b', 20, 20, 'Runtime.consoleAPICalled', { type: 'warn', args: [{ value: 'other' }] })
    expect(logs.console('a')).toHaveLength(200)
    expect(logs.console('a')[0]).toMatchObject({ text: 'entry-5' })
    expect(logs.console('b')).toEqual([expect.objectContaining({ text: 'other' })])
  })
})
