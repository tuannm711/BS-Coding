import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import RemoteControlPanel from '../../../src/renderer/src/v2/screens/settings/RemoteControlPanel'
import UpdatesPanel from '../../../src/renderer/src/v2/screens/settings/UpdatesPanel'

it('renders accessible typed update controls from a V2 snapshot', () => {
  const markup = renderToStaticMarkup(<UpdatesPanel initialStatus={{
    state: 'AVAILABLE', channel: 'BETA', version: '2.0.1', currentVersion: '2.0.0',
    releaseNotes: 'Security fixes'
  }} />)

  expect(markup).toContain('role="radiogroup"')
  expect(markup).toContain('Beta')
  expect(markup).toContain('v2.0.1 is available')
  expect(markup).toContain('Download update')
})

it('renders pairing expiry and device revocation without V1 placeholders', () => {
  const markup = renderToStaticMarkup(<RemoteControlPanel initialStatus={{
    enabled: true, state: 'PAIRING', relayUrl: 'wss://relay.example', code: '482731',
    expiresAt: '2026-09-01T00:05:00.000Z',
    devices: [{ id: 'phone-1', name: 'Phone', status: 'ONLINE' }]
  }} now={() => Date.parse('2026-09-01T00:00:28.000Z')} />)

  expect(markup).toContain('role="switch"')
  expect(markup).toContain('482731')
  expect(markup).toContain('Expires in 4:32')
  expect(markup).toContain('Disconnect Phone')
  expect(markup).not.toContain('will bind to its typed contract')
})
